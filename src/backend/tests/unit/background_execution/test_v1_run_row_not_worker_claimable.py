"""LE-3302 F-02 / F-03: a v1 /run job row must be invisible to scaled workers.

A v1 ``POST /api/v1/run/{flow_id}`` executes IN the API process. Its ``job`` row is
only a tracking handle (memory-base ``on_flow_output`` + status/stop isolation), not
work for a ``langflow worker`` to pick up. Before this fix ``simple_run_flow`` created
that row with ``create_job``'s default ``QUEUED`` status and let ``execute_with_status``
flip it to IN_PROGRESS later. In the window between, a scaled worker's reconcile path
lists QUEUED WORKFLOW rows (``queued_workflow_job_ids``) and lease-claims the ones whose
create-time heartbeat has gone stale (``claim_queued_lease``) — then reconstructs an
EMPTY request (the v1 row stores none) and re-runs the flow with ``""``. That is F-02:
the caller gets HTTP 500 and its input never runs, or the job runs twice (API with the
real input, worker with an empty one).

The fix: ``simple_run_flow`` creates the row already IN_PROGRESS
(``status=JobStatus.IN_PROGRESS`` + ``execute_with_status(mark_in_progress=False)``),
exactly as ``create_job``'s own docstring prescribes for "a caller that starts the run
right away, in the same request". An IN_PROGRESS row is never in the QUEUED-claim path,
so no worker can take it, no matter how slow the API is.

F-03 is a SEPARATE bug that this status change does NOT fix: an IN_PROGRESS row whose
in-process keep-alive is starved (DB connection-pool exhaustion) goes stale, and
``sweep_orphans`` fails it ``worker_lost`` even though the in-process run completed and
returned 200. Asserted here so the split is explicit and regression-guarded — fixing
F-03 is tracked separately.

Drives the REAL job-service claim/reap primitives against real SQLite AND real Postgres.
No mocks: ``queued_workflow_job_ids`` + ``claim_queued_lease`` are the exact primitives
the worker reconcile uses (background_execution/service.py:938-945), and
``sweep_orphans`` is the exact watchdog reaper.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from langflow.services.database.models.jobs.model import JobStatus, JobType

# Short lease like Rafael's run #899 (LANGFLOW_BACKGROUND_LEASE_TTL_S=2): the window a
# slow API leaves open. The bug is timing-sensitive, so the test ages the heartbeat past
# the lease deterministically instead of racing a real wall-clock delay.
LEASE_TTL_S = 2.0


async def _expire_lease(service, job_id):
    """Age the row's heartbeat well past the lease — the API was slow to start the run."""
    stale = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    await service.update_job_metadata(job_id, {"owner": "api", "heartbeat_at": stale})


@pytest.mark.real_services
async def test_pre_fix_queued_v1_row_is_claimed_by_a_worker(real_services_job_service):
    """REPRO F-02: the old QUEUED v1 row is listed and lease-claimed by a worker."""
    service = real_services_job_service
    job_id = uuid4()
    # Exactly how simple_run_flow created the row BEFORE the fix: QUEUED (create_job's
    # default), inserted already heartbeated.
    await service.create_job(
        job_id=job_id,
        flow_id=uuid4(),
        user_id=uuid4(),
        job_type=JobType.WORKFLOW,
        heartbeat=True,
    )
    await _expire_lease(service, job_id)

    # The scaled worker's reconcile path (background_execution/service.py:938-945).
    assert job_id in await service.queued_workflow_job_ids()
    claimed = await service.claim_queued_lease(
        job_id,
        owner="worker-1",
        lease_ttl_s=LEASE_TTL_S,
        heartbeat_at=datetime.now(timezone.utc).isoformat(),
    )
    # BUG: a worker takes a run the API owns -> it reruns the flow with an empty request.
    assert claimed is True


@pytest.mark.real_services
async def test_fixed_in_progress_v1_row_is_invisible_to_a_worker(real_services_job_service):
    """FIX F-02: the IN_PROGRESS row is never in the QUEUED-claim path, even stale."""
    service = real_services_job_service
    job_id = uuid4()
    # Exactly how simple_run_flow creates the row AFTER the fix.
    await service.create_job(
        job_id=job_id,
        flow_id=uuid4(),
        user_id=uuid4(),
        job_type=JobType.WORKFLOW,
        status=JobStatus.IN_PROGRESS,
        heartbeat=True,
    )
    await _expire_lease(service, job_id)

    # Even with the lease expired, there is no QUEUED row for a worker to see or claim.
    assert job_id not in await service.queued_workflow_job_ids()
    claimed = await service.claim_queued_lease(
        job_id,
        owner="worker-1",
        lease_ttl_s=LEASE_TTL_S,
        heartbeat_at=datetime.now(timezone.utc).isoformat(),
    )
    assert claimed is False


@pytest.mark.real_services
async def test_f03_stale_in_progress_row_still_fails_worker_lost(real_services_job_service):
    """F-03 is independent of the status fix: a starved IN_PROGRESS row is reaped.

    This is the bug the status change does NOT close. Guards against anyone assuming
    F-02's fix also fixed F-03.
    """
    service = real_services_job_service
    job_id = uuid4()
    await service.create_job(
        job_id=job_id,
        flow_id=uuid4(),
        user_id=uuid4(),
        job_type=JobType.WORKFLOW,
        status=JobStatus.IN_PROGRESS,
        heartbeat=True,
    )
    # In-process keep-alive starved (pool exhaustion) -> the heartbeat stops refreshing.
    await _expire_lease(service, job_id)

    swept = await service.sweep_orphans(lease_ttl_s=LEASE_TTL_S)

    assert job_id in swept  # F-03 still fires: a completed run would be recorded failed.
    job = await service.get_job_by_job_id(job_id)
    assert job.status == JobStatus.FAILED
    assert (job.error or {}).get("type") == "worker_lost"


async def test_simple_run_flow_creates_the_row_in_progress(monkeypatch):
    """SOURCE proof: ``simple_run_flow`` creates the v1 row IN_PROGRESS, not QUEUED.

    This is the one test that goes RED on unpatched source — before the fix ``create_job``
    is called with no ``status`` (defaulting QUEUED) and ``execute_with_status`` with no
    ``mark_in_progress``. The real-DB tests above prove what that status change buys; this
    proves ``simple_run_flow`` actually makes the change. Follows the warm-graph seam-test
    idiom (test_warm_graph_execution.py): a mocked job service captures the call arguments.
    """
    from langflow.api import warm_graph
    from langflow.api.v1 import endpoints
    from langflow.api.v1.schemas import SimplifiedAPIRequest
    from langflow.services.deps import get_settings_service

    monkeypatch.setattr(get_settings_service().settings, "custom_component_admin_only", False)

    graph = SimpleNamespace(vertices=[], run_id=None)
    graph.set_run_id = lambda run_id: setattr(graph, "run_id", str(run_id))

    async def fake_warm_deepcopy(flow_id, **_kwargs):  # noqa: ARG001
        return graph

    job_service = SimpleNamespace(
        create_job=AsyncMock(),
        execute_with_status=AsyncMock(return_value=([], "effective-session")),
    )
    monkeypatch.setattr(warm_graph, "warm_deepcopy", fake_warm_deepcopy)
    monkeypatch.setattr(endpoints, "get_job_service", lambda: job_service)
    monkeypatch.setattr(endpoints, "get_task_service", lambda: SimpleNamespace(fire_and_forget_task=AsyncMock()))
    monkeypatch.setattr(endpoints, "get_memory_base_service", lambda: SimpleNamespace(on_flow_output=AsyncMock()))
    # Force the warm path; the cold path would need a real graph build.
    monkeypatch.setattr(endpoints, "process_tweaks", Mock(side_effect=AssertionError("cold path used")))

    user_id = uuid4()
    await endpoints.simple_run_flow(
        flow=SimpleNamespace(
            id=uuid4(),
            user_id=user_id,
            name="warm",
            data={"nodes": [], "edges": []},
            updated_at=datetime(2026, 8, 5, 12, tzinfo=timezone.utc),
        ),
        input_request=SimplifiedAPIRequest(session_id="v1-session"),
        stream=False,
        api_key_user=SimpleNamespace(id=user_id, is_superuser=False),
    )

    # The row is born IN_PROGRESS, so the scaled worker's QUEUED-claim path never sees it.
    assert job_service.create_job.await_args.kwargs.get("status") == JobStatus.IN_PROGRESS
    # execute_with_status skips the now-redundant QUEUED->IN_PROGRESS flip.
    assert job_service.execute_with_status.await_args.kwargs.get("mark_in_progress") is False
