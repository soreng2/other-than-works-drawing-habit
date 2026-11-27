#!/usr/bin/env python3
"""Korean adaptation of founder-skill's panel.py (MIT, Jake Schincariol; see LICENSE-founder-skill).
Changes: Korean names, income in 만 원/year, Korean buyer brief. Logic unchanged.

The buyer panel for founder-consumer. Standard library only, no network.

It does the bookkeeping for a swarm of simulated buyers: it deals one persona card
per buyer from your target-customer profile (income, age, behaviour, objection),
writes one brief per buyer for a sub-agent to answer, checks the answers, and
tallies who buys, who doesn't, and why.

    python3 panel.py init --customer founder/customer.json --pitch founder/pitch.md [--n 100] [--seed 7]
    python3 panel.py prompts [--wave 10]     # one brief per buyer still to run, listed in waves
    python3 panel.py check                   # which answers are missing or broken
    python3 panel.py save P003 < reply.txt   # file a buyer's own JSON that it printed instead of writing
    python3 panel.py tally [--out founder/panel/results.md]
    python3 panel.py status

State lives in founder/panel/ (--dir to change it): panel.json, personas.json,
briefs/<id>.md, answers/<id>.json, results.md, results.json.

The tool never answers for a buyer. Every number in results.md is counted from
the answer files the sub-agents wrote. Simulated buyers are a fast, cheap way to
find objections and weak spots. They are not customers: confirm what matters
with real ones (a pre-sale, a waitlist, a landing page with a price on it).
"""

import argparse
import json
import os
import random
import sys

FIRST_NAMES = ['지민', '서연', '하은', '민준', '수아', '도윤', '예린', '지우', '서준', '하린', '유진', '다은', '시우', '채원', '은서', '준호', '소율', '지호', '나연', '현우', '가은', '태윤', '윤아', '승민', '세아', '정우', '아린', '민서', '유나', '재윤', '소희', '건우', '하늘', '다인', '예준', '지안', '연우', '수빈', '주원', '보람', '규리', '은우', '한별', '서윤', '태희', '지원', '혜인', '동현', '미소', '진아', '상우', '예지', '우진', '슬기', '하준', '다현', '성민', '유리', '민지', '준서', '이현', '소연', '재희', '경민', '나은', '시온', '혜진', '도연', '가윤', '지후', '은지', '선우', '라희', '현서', '채린', '진우', '보은', '서진', '하율', '민아', '윤서', '태오', '수진', '해원', '지아', '승아', '로아', '은호', '주아', '연서', '가람', '시은', '무진', '단비', '이서', '선아', '다온', '효주', '정민', '아영', '세린', '기현', '나래', '소은', '진호', '루다', '영서', '한결', '시아', '태린']
REASONS = ["price", "habit", "need", "trust", "quality", "convenience", "timing", "values", "other"]
ANSWER_FIELDS = {"id", "buys", "reason_code", "reason"}
WAVE = 10


class PanelError(Exception):
    pass


# ── dealing ─────────────────────────────────────────────────────────────────────
def _quota(items, n, key="share"):
    """Split n across items by their shares, exactly (largest remainder)."""
    total = sum(float(it.get(key, 1)) for it in items) or 1.0
    raw = [n * float(it.get(key, 1)) / total for it in items]
    counts = [int(r) for r in raw]
    order = sorted(range(len(items)), key=lambda i: raw[i] - counts[i], reverse=True)
    for i in order[: n - sum(counts)]:
        counts[i] += 1
    return counts


def validate_customer(c):
    for k in ("business", "target", "segments", "behaviours", "objections"):
        if k not in c or c[k] in ("", [], None):
            raise PanelError("customer.json needs '%s'" % k)
    for s in c["segments"]:
        if "name" not in s or "income" not in s or len(s["income"]) != 2:
            raise PanelError("every segment needs a name and an income [low, high]")
    for b in c["behaviours"]:
        if "name" not in b:
            raise PanelError("every behaviour needs a name")


def deal(customer, n=100, seed=7):
    """Deal n persona cards. Same customer + n + seed = the same cards, every time."""
    validate_customer(customer)
    if n < 1:
        raise PanelError("--n must be at least 1")
    rng = random.Random(seed)
    age = customer.get("age", [25, 45])
    segs = []
    for s, k in zip(customer["segments"], _quota(customer["segments"], n)):
        segs += [s] * k
    behs = []
    for b, k in zip(customer["behaviours"], _quota(customer["behaviours"], n)):
        behs += [b] * k
    rng.shuffle(segs)
    rng.shuffle(behs)
    names = FIRST_NAMES[:]
    rng.shuffle(names)
    while len(names) < n:
        names += ["%s %d" % (x, len(names) // len(FIRST_NAMES) + 1) for x in FIRST_NAMES]
    objections = customer["objections"]
    habits = customer.get("habits") or []
    cards = []
    for i in range(n):
        s, b = segs[i], behs[i]
        lo, hi = float(s["income"][0]), float(s["income"][1])
        cards.append({
            "id": "P%03d" % (i + 1),
            "name": names[i],
            "age": rng.randint(int(age[0]), int(age[1])),
            "segment": s["name"],
            "income": int(round(rng.uniform(lo, hi), -2)),
            "behaviour": b["name"],
            "behaviour_how": b.get("how", ""),
            "objection": objections[rng.randrange(len(objections))],
            "habit": habits[rng.randrange(len(habits))] if habits else "",
        })
    return cards


# ── state ───────────────────────────────────────────────────────────────────────
def _path(d, *p):
    return os.path.join(d, *p)


def _read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _write_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


def init(d, customer_path, pitch_path, n=100, seed=None):
    try:
        customer = _read_json(customer_path)
    except FileNotFoundError:
        raise PanelError("no such file: %s" % customer_path)
    try:
        with open(pitch_path, encoding="utf-8") as fh:
            pitch = fh.read().strip()
    except FileNotFoundError:
        raise PanelError("no such file: %s (write the pitch first: what you sell, the price, where)" % pitch_path)
    if not pitch:
        raise PanelError("the pitch is empty")
    if seed is None:
        seed = random.SystemRandom().randrange(1, 10 ** 6)
    cards = deal(customer, n, seed)
    _write_json(_path(d, "panel.json"), {"n": n, "seed": seed, "customer": customer, "pitch": pitch})
    _write_json(_path(d, "personas.json"), cards)
    os.makedirs(_path(d, "briefs"), exist_ok=True)
    os.makedirs(_path(d, "answers"), exist_ok=True)
    return cards


def load_state(d):
    try:
        return _read_json(_path(d, "panel.json")), _read_json(_path(d, "personas.json"))
    except FileNotFoundError:
        raise PanelError("no panel in %s: run init first" % d)


BRIEF = """당신은 소비자 패널에 참여한 가상의 구매자입니다. 창업자는 돈을 쓰기 전에, 당신 같은 실제 사람들이 이걸 살지 알고 싶어 합니다. 솔직해야만 쓸모가 있습니다. 대부분의 사람은 대부분의 상품을 사지 않으며, 예의상 '살게요'는 분명한 '안 살래요'보다 해롭습니다.

=== 당신은 누구인가 ===
{name}, {age}세. {segment}. 연 소득(본인 기준) 약 {income:,}만 원.
사는 방식: {behaviour}. {behaviour_how}
{habit_line}이런 제안을 들으면 제일 먼저 드는 생각: "{objection}"
당신은 이런 사람 중 한 명입니다: {target}.
=== 끝 ===

=== 제안 내용 (인스타그램을 넘기다 처음 보는 사람처럼 봅니다) ===
{pitch}
=== 끝 ===

{name}의 돈, 습관, 의심을 가지고, 평범한 한 주에 실제로 내릴 결정을 하세요. 맞장구치지 마세요. 위에 쓰인 것 이상으로 사업에 대한 사실을 지어내지 마세요. 무료 진단만 해 보고 유료는 안 사는 것도 '안 산다'입니다.

파일 쓰기 도구로 {out} 파일을 만드세요 (답장에 출력만 하지 말 것). 내용은 아래 JSON만, 마크다운 코드 블록 없이, 다른 글 없이. 글은 한국어로, 값의 가격은 원 단위 숫자로:
{{
  "id": "{id}",
  "buys": 유료 리포트를 산다면 true, 아니면 false,
  "purchases_first_month": 첫 달에 유료 리포트를 몇 번 살지 (안 사면 0),
  "free_test": 무료 진단은 해 볼지 true 또는 false,
  "class_interest": 리포트 뒤에 수업(4주 온라인 클럽 또는 1:1 워크숍)까지 신청할 가능성 "높음" / "보통" / "낮음" / "없음" 중 하나,
  "reason_code": {reasons} 중 하나,
  "reason": "왜 그런지, 한두 문장, 내 말투로",
  "objection": "가장 크게 걸리는 의심, 내 말로",
  "would_change_my_mind": "내 답을 뒤집을 단 한 가지, 없으면 빈 문자열",
  "price_too_cheap": 너무 싸서 믿음이 안 가는 가격 (원, 숫자),
  "price_cheap": 싸다고 느끼는 가격 (원, 숫자),
  "price_expensive": 비싸다고 느끼기 시작하지만 살 수도 있는 가격 (원, 숫자),
  "price_too_expensive": 절대 안 사는 가격 (원, 숫자)
}}
"""


def write_briefs(d, wave=WAVE):
    state, cards = load_state(d)
    target = state["customer"]["target"]
    todo = []
    for c in cards:
        out = _path(d, "answers", c["id"] + ".json")
        if _answer_ok(out, c["id"]) is None:
            continue
        brief = BRIEF.format(pitch=state["pitch"], target=target, out=os.path.abspath(out),
                             habit_line=("평소 하루: %s.\n" % c["habit"]) if c.get("habit") else "",
                             reasons=" / ".join(REASONS), **c)
        bp = _path(d, "briefs", c["id"] + ".md")
        with open(bp, "w", encoding="utf-8") as fh:
            fh.write(brief)
        todo.append((c["id"], os.path.abspath(bp)))
    waves = [todo[i:i + wave] for i in range(0, len(todo), wave)]
    return waves


def _answer_ok(path, pid):
    """None if the answer file is good, else a short problem string."""
    if not os.path.exists(path):
        return "missing"
    try:
        a = _read_json(path)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return "not valid JSON"
    missing = ANSWER_FIELDS - set(a)
    if missing:
        return "missing " + ", ".join(sorted(missing))
    if a.get("id") != pid:
        return "id is %r, expected %s" % (a.get("id"), pid)
    if not isinstance(a.get("buys"), bool):
        return "'buys' must be true or false"
    if a.get("reason_code") not in REASONS:
        return "reason_code %r is not one of %s" % (a.get("reason_code"), ", ".join(REASONS))
    return None


def save(d, pid, text):
    """File a buyer's OWN answer that it printed instead of writing. Never used to answer for a buyer."""
    _, cards = load_state(d)
    if pid not in {c["id"] for c in cards}:
        raise PanelError("no buyer %s on this panel" % pid)
    start = text.find("{")
    if start < 0:
        raise PanelError("no JSON object in the reply")
    try:
        obj, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError as e:
        raise PanelError("the reply's JSON does not parse: %s" % e)
    path = _path(d, "answers", pid + ".json")
    _write_json(path, obj)
    prob = _answer_ok(path, pid)
    if prob:
        os.remove(path)
        raise PanelError("%s's answer is not valid (%s); re-run its brief instead" % (pid, prob))
    return path


def check(d):
    _, cards = load_state(d)
    probs = []
    for c in cards:
        p = _answer_ok(_path(d, "answers", c["id"] + ".json"), c["id"])
        if p:
            probs.append((c["id"], p))
    return probs


# ── tally ───────────────────────────────────────────────────────────────────────
def _rate(rows):
    return (sum(1 for r in rows if r["buys"]) / len(rows)) if rows else 0.0


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def tally(d):
    state, cards = load_state(d)
    by_id = {c["id"]: c for c in cards}
    rows, skipped = [], []
    for c in cards:
        path = _path(d, "answers", c["id"] + ".json")
        p = _answer_ok(path, c["id"])
        if p:
            skipped.append((c["id"], p))
            continue
        a = _read_json(path)
        rows.append(dict(by_id[c["id"]], **{k: v for k, v in a.items() if k != "id"}, id=c["id"]))
    if not rows:
        raise PanelError("no valid answers yet: run the briefs first (panel.py prompts)")

    def group(key):
        out = {}
        for r in rows:
            out.setdefault(r[key], []).append(r)
        return sorted(((k, len(v), _rate(v)) for k, v in out.items()), key=lambda t: -t[2])

    # income in thirds of the dealt range, so the bands mean the same thing every run
    incomes = sorted(r["income"] for r in rows)
    cut1, cut2 = incomes[len(incomes) // 3], incomes[2 * len(incomes) // 3]
    for r in rows:
        r["income_band"] = ("%s만 원 미만" % "{:,}".format(cut1)) if r["income"] < cut1 else (
            ("%s만 원 이상" % "{:,}".format(cut2)) if r["income"] >= cut2 else "%s~%s만 원" % ("{:,}".format(cut1), "{:,}".format(cut2)))

    no = [r for r in rows if not r["buys"]]
    yes = [r for r in rows if r["buys"]]

    def reasons(rs):
        out = {}
        for r in rs:
            out.setdefault(r["reason_code"], []).append(r)
        return sorted(((k, v) for k, v in out.items()), key=lambda kv: -len(kv[1]))

    def mean(vals):
        vals = [v for v in vals if v is not None]
        return sum(vals) / len(vals) if vals else None

    res = {
        "business": state["customer"]["business"], "seed": state["seed"], "dealt": len(cards),
        "answered": len(rows), "skipped": skipped, "buys": len(yes), "passes": len(no),
        "buy_rate": len(yes) / len(rows),
        "by_segment": group("segment"), "by_behaviour": group("behaviour"), "by_income": group("income_band"),
        "why_not": [(k, len(v), [r["reason"] for r in v[:2]], [r["id"] for r in v[:2]]) for k, v in reasons(no)],
        "why_yes": [(k, len(v), [r["reason"] for r in v[:2]], [r["id"] for r in v[:2]]) for k, v in reasons(yes)],
        "flip": [r["would_change_my_mind"] for r in no if (r.get("would_change_my_mind") or "").strip()],
        "purchases_first_month_per_buyer": mean([_num(r.get("purchases_first_month")) for r in yes]),
        "price_answers": sum(1 for r in rows if all(_num(r.get(k)) is not None for k in
                                                     ("price_too_cheap", "price_cheap", "price_expensive", "price_too_expensive"))),
    }
    return res


def results_md(res):
    pct = lambda v: "%.0f%%" % (v * 100)
    L = ["# Buyer panel: %s" % res["business"], ""]
    L.append("**%d buy · %d pass** (%s buy) out of %d simulated buyers. Seed %s, so the same cards can be dealt again."
             % (res["buys"], res["passes"], pct(res["buy_rate"]), res["answered"], res["seed"]))
    if res["skipped"]:
        L.append("")
        L.append("%d of %d buyers have no valid answer and are left out: %s." % (
            len(res["skipped"]), res["dealt"], ", ".join("%s (%s)" % s for s in res["skipped"][:10])))
    L.append("")
    L.append("These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the"
             " big ones with real people before you spend.")
    for title, key in (("By segment", "by_segment"), ("By buying behaviour", "by_behaviour"), ("By income", "by_income")):
        L += ["", "## %s" % title, "", "| group | buyers | buy rate |", "| --- | ---: | ---: |"]
        for k, n, r in res[key]:
            L.append("| %s | %d | %s%s |" % (k, n, pct(r), "  (thin)" if n < 8 else ""))
    L += ["", "## Why they pass", "", "| reason | buyers | in their words |", "| --- | ---: | --- |"]
    for k, n, quotes, ids in res["why_not"]:
        L.append("| %s | %d | %s |" % (k, n, " · ".join('"%s" (%s)' % (q.replace("|", "/"), i) for q, i in zip(quotes, ids))))
    L += ["", "## Why they buy", "", "| reason | buyers | in their words |", "| --- | ---: | --- |"]
    for k, n, quotes, ids in res["why_yes"]:
        L.append("| %s | %d | %s |" % (k, n, " · ".join('"%s" (%s)' % (q.replace("|", "/"), i) for q, i in zip(quotes, ids))))
    if res["flip"]:
        L += ["", "## What would flip a no", ""]
        for f in res["flip"][:12]:
            L.append("- %s" % f)
    if res["purchases_first_month_per_buyer"] is not None:
        L += ["", "Buyers say they would buy **%.1f times** in the first month on average." % res["purchases_first_month_per_buyer"]]
    if res["price_answers"]:
        L += ["", "%d buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder." % res["price_answers"]]
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dir", default=os.path.join("founder", "panel"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init")
    i.add_argument("--customer", required=True)
    i.add_argument("--pitch", required=True)
    i.add_argument("--n", type=int, default=100)
    i.add_argument("--seed", type=int)
    p = sub.add_parser("prompts")
    p.add_argument("--wave", type=int, default=WAVE)
    sub.add_parser("check")
    sv = sub.add_parser("save")
    sv.add_argument("id")
    t = sub.add_parser("tally")
    t.add_argument("--out")
    sub.add_parser("status")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "init":
            cards = init(a.dir, a.customer, a.pitch, a.n, a.seed)
            st, _ = load_state(a.dir)
            print("dealt %d buyers (seed %s) into %s. Next: panel.py prompts" % (len(cards), st["seed"], a.dir))
        elif a.cmd == "prompts":
            waves = write_briefs(a.dir, a.wave)
            n = sum(len(w) for w in waves)
            if not n:
                print("every buyer has a valid answer. Next: panel.py tally")
            else:
                print("%d briefs in %d waves of up to %d. Launch one wave at a time:" % (n, len(waves), a.wave))
                for k, w in enumerate(waves, 1):
                    print("wave %d: %s" % (k, " ".join("%s=%s" % job for job in w)))
        elif a.cmd == "check":
            probs = check(a.dir)
            if not probs:
                print("all answers present and valid")
            for pid, prob in probs:
                print("%s: %s" % (pid, prob))
            return 1 if probs else 0
        elif a.cmd == "save":
            print("saved %s" % save(a.dir, a.id, sys.stdin.read()))
        elif a.cmd == "tally":
            res = tally(a.dir)
            text = results_md(res)
            out = a.out or _path(a.dir, "results.md")
            with open(out, "w", encoding="utf-8") as fh:
                fh.write(text)
            _write_json(_path(a.dir, "results.json"), res)
            print("%d buy · %d pass (%.0f%%). Wrote %s" % (res["buys"], res["passes"], res["buy_rate"] * 100, out))
        elif a.cmd == "status":
            st, cards = load_state(a.dir)
            probs = check(a.dir)
            print("%d buyers dealt (seed %s), %d answered, %d to go" % (len(cards), st["seed"], len(cards) - len(probs), len(probs)))
    except PanelError as e:
        print("error: %s" % e, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
