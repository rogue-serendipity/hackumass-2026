"""Shared test setup: no hold-and-ask wait (H12) unless a test turns it on."""

import pytest

import approvals


@pytest.fixture(autouse=True)
def no_approval_wait(monkeypatch):
    monkeypatch.setattr(approvals, "APPROVAL_S", 0.0)
    approvals.reset()  # no pending waits or remembered decisions carry over between tests
    yield
    approvals.reset()
