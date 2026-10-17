"""Scoring formula on the two demo fixtures and the cant_tell case."""

from app.config import fixture
from app.contracts import JevScore, Signal
from app.fraud.scoring import band_for, score


def ctx_from(name):
    report = fixture(name)
    return {
        "entities": report["entities"],
        "crawl_ok": True,
        "signals": [Signal.model_validate(s) for s in report["signals"]],
        "jev_scores": [JevScore.model_validate(s) for s in report["jev_scores"]],
    }


def test_real_is_low():
    likelihood, band, reason = score(ctx_from("fraud_real.json"))
    assert likelihood < 25 and band == "low"
    assert "match the official record" in reason


def test_clone_is_high():
    likelihood, band, reason = score(ctx_from("fraud_clone.json"))
    assert likelihood > 60 and band == "high"
    assert likelihood == 93  # 0.96 * 50 + 30 contact + 15 domain age
    assert reason == (
        "Main factors: pressure language scored 0.96 on average and "
        "contact details that do not match the official record."
    )


def test_cant_tell_without_firm_or_crawl():
    assert score({"entities": {"firms": []}, "crawl_ok": False, "signals": []}) == (
        None,
        "cant_tell",
        "No firm was named and no website could be visited.",
    )


def test_bonuses_and_clamp():
    signals = [
        Signal(id="phone_match", label="", check="fail", detail=""),
        Signal(id="firm_not_found", label="", check="fail", detail=""),
        Signal(id="domain_age", label="", check="fail", detail=""),
        Signal(id="redirect_offsite", label="", check="warn", detail=""),
    ]
    jev = [JevScore(flag="x", label="x", confidence=1, evidence="e")]
    ctx = {"entities": {"firms": ["A"]}, "signals": signals, "jev_scores": jev}
    likelihood, band, _ = score(ctx)
    assert likelihood == 99 and band == "high"
    ok = [Signal(id=i, label="", check="pass", detail="") for i in ("phone_match", "website_match")]
    assert score({"entities": {"firms": ["A"]}, "signals": ok, "jev_scores": []})[0] == 1
    assert [band_for(n) for n in (24, 25, 60, 61)] == ["low", "elevated", "elevated", "high"]
