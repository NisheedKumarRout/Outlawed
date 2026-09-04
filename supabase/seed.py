"""
supabase/seed.py

Seeds the OUTLAWED OTR database with real content from OutLawed India's
OTR Insights report and PLV qualitative survey.

CORRECTED from the first version of this script: OutLawed India is the
platform ADMIN (matches "Admin / Outlawed" in the original proposal),
not a contributing organisation. The organisations submitting insights
are KSLSA (the real state authority) and three real District Legal
Services Authorities — Haveri, Chikkaballapur, and Kolar — using their
actual district-specific survey findings. A fifth district, Ramanagara,
is seeded as a still-pending verification application with zero posts,
so the admin's Verifications queue has something to act on too.

Nothing here is a fabricated NGO — every organisation name is a real,
named institution that already appears in your source documents.

Safe to re-run: post ids are derived deterministically from each title
(uuid5), and existing posts and verification requests are left unchanged.

Usage:
    pip install supabase python-dotenv openai
    python supabase/seed.py

Required environment variables (.env or exported in your shell):

    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY   # service role, NOT anon — this script bypasses RLS on purpose
    OPENAI_API_KEY              # optional — omit and posts seed without embeddings

IMPORTANT: whichever embedding model this script uses (text-embedding-3-small
below) MUST be the exact same model agent-service uses when embedding a
user's query for Similar Cases, or similarity scores will be silently wrong.
"""

import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "ChangeMe123!seed")

SEED_NAMESPACE = uuid.UUID("d7b1f0a0-1111-4c9a-9d3e-abcdefabcdef")

CASE_IMAGES = {
    "Cybercrime Awareness Is Missing From Standard PLV Training": "/case-images/cybercrime-training.webp",
    "Long-Tenured PLVs Want Validation, New PLVs Want Courage": "/case-images/plv-tenure-workshop.webp",
    "Interactive, Local-Language Training Reduced Fear of Police Non-Response": "/case-images/local-language-training.webp",
    "A Shared Repository Was the Ecosystem's Own Idea": "/case-images/peer-review-session.webp",
    "Confusion Regarding Funds: What Districts Don't Track": "/case-images/district-funding-review.webp",
    "Bridging the Formal and the Informal": "/case-images/formal-informal-bridge.webp",
    "Deployment Without a System: Why PLV Impact Depends on One Person": "/case-images/plv-field-deployment.webp",
    "The Identity Crisis of PLVs": "/case-images/plv-identity-workers.webp",
}

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_embedding(text: str) -> list[float] | None:
    if not OPENAI_API_KEY:
        return None
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.embeddings.create(model="text-embedding-3-small", input=text)
    return response.data[0].embedding


# ---------------------------------------------------------------------------
# Generic account helpers — reused for the admin and every organisation
# ---------------------------------------------------------------------------
def get_or_create_user(email: str, display_name: str) -> str:
    existing_users = supabase.auth.admin.list_users()
    match = next((u for u in existing_users if u.email == email), None)

    if match:
        user_id = match.id
        print(f"Found existing account: {display_name} ({user_id})")
    else:
        created = supabase.auth.admin.create_user({
            "email": email,
            "password": SEED_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"display_name": display_name},
        })
        user_id = created.user.id
        print(f"Created account: {display_name} ({user_id})")

    supabase.table("profiles").update({"display_name": display_name}).eq("id", user_id).execute()
    return user_id


def set_role(user_id: str, role: str) -> None:
    supabase.table("profiles").update({"role": role}).eq("id", user_id).execute()


def upsert_organization(user_id: str, org_name: str, description: str, sectors: list[str], verified: bool) -> None:
    supabase.table("organizations").upsert({
        "id": user_id,
        "org_name": org_name,
        "description": description,
        "sectors": sectors,
        "verified": verified,
    }).execute()


def submit_verification_request(profile_id: str, org_name: str, description: str) -> None:
    existing = (
        supabase.table("verification_requests")
        .select("id,status")
        .eq("profile_id", profile_id)
        .eq("request_type", "organization")
        .limit(1)
        .execute()
    )
    if existing.data:
        status = existing.data[0]["status"]
        print(f"Verification request already exists for {org_name} [{status}]")
        return
    supabase.table("verification_requests").insert({
        "profile_id": profile_id,
        "request_type": "organization",
        "payload": {"org_name": org_name, "description": description},
        "status": "pending",
    }).execute()
    print(f"Submitted pending verification request for {org_name}")


# ---------------------------------------------------------------------------
# The admin
# ---------------------------------------------------------------------------
ADMIN_EMAIL = "admin.outlawedindia@seed.outlawedotr.local"
ADMIN_NAME = "OutLawed India"
READER_EMAIL = "reader@seed.outlawedotr.local"
READER_NAME = "OTR Reader"


def seed_admin() -> str:
    admin_id = get_or_create_user(ADMIN_EMAIL, ADMIN_NAME)
    set_role(admin_id, "admin")
    return admin_id


def seed_reader() -> str:
    """A read-only demo account, intentionally not tied to an organization."""
    reader_id = get_or_create_user(READER_EMAIL, READER_NAME)
    set_role(reader_id, "individual")
    return reader_id


# ---------------------------------------------------------------------------
# The organisations — real named institutions, not fabricated NGOs
# ---------------------------------------------------------------------------
ORGS = {
    "kslsa": {
        "email": "kslsa@seed.outlawedotr.local",
        "name": "Karnataka State Legal Services Authority (KSLSA)",
        "description": (
            "The state authority overseeing legal aid delivery in Karnataka, including the "
            "state-wide Para Legal Volunteer (PLV) programme run in partnership with OutLawed India."
        ),
        "sectors": ["Access to Justice", "Legal Aid Training"],
        "verified": True,
    },
    "haveri": {
        "email": "haveri.dlsa@seed.outlawedotr.local",
        "name": "Haveri DLSA",
        "description": "District Legal Services Authority, Haveri district, Karnataka.",
        "sectors": ["Access to Justice", "Legal Aid Training"],
        "verified": True,
    },
    "chikkaballapur": {
        "email": "chikkaballapur.dlsa@seed.outlawedotr.local",
        "name": "Chikkaballapur DLSA",
        "description": "District Legal Services Authority, Chikkaballapur district, Karnataka.",
        "sectors": ["Access to Justice", "Legal Aid Training"],
        "verified": True,
    },
    "kolar": {
        "email": "kolar.dlsa@seed.outlawedotr.local",
        "name": "Kolar DLSA",
        "description": "District Legal Services Authority, Kolar district, Karnataka.",
        "sectors": ["Access to Justice", "Legal Aid Training"],
        "verified": True,
    },
    "ramanagara": {
        "email": "ramanagara.dlsa@seed.outlawedotr.local",
        "name": "Ramanagara DLSA",
        "description": "District Legal Services Authority, Ramanagara district, Karnataka.",
        "sectors": ["Access to Justice"],
        "verified": False,  # deliberately unverified — seeds the admin Verifications queue
    },
}


def seed_organizations() -> dict[str, str]:
    org_ids: dict[str, str] = {}
    for key, org in ORGS.items():
        user_id = get_or_create_user(org["email"], org["name"])
        set_role(user_id, "org")
        if org["verified"]:
            # Verified orgs skip the application flow for seed speed — only
            # Ramanagara below demonstrates the pending-application path.
            upsert_organization(user_id, org["name"], org["description"], org["sectors"], verified=True)
        else:
            submit_verification_request(user_id, org["name"], org["description"])
        org_ids[key] = user_id
    return org_ids


# ---------------------------------------------------------------------------
# Seed posts — real content, now attributed to the real org that would
# plausibly have submitted it, not to OutLawed India (which is admin).
# ---------------------------------------------------------------------------
def post_id_for(title: str) -> str:
    return str(uuid.uuid5(SEED_NAMESPACE, title))


SEED_POSTS = [
    {
        "org_key": "kslsa",
        "title": "The Identity Crisis of PLVs",
        "status": "approved",
        "sector": ["Access to Justice", "Legal Aid Training"],
        "target_group": ["Women", "Frontline Community Workers"],
        "geography": "Karnataka (state-wide, 24 districts)",
        "tags": ["PLV", "role clarity", "workload", "gender"],
        "problem": (
            "PLV work is layered on top of volunteers' existing jobs rather than replacing them. "
            "A large share of PLVs are already ASHA workers, Anganwadi workers, or teachers, and "
            "this adds to an already heavy workload with no corresponding reduction elsewhere."
        ),
        "context": (
            "Findings from an OTR (On The Record) peer-review workshop where 40 participants "
            "examined PLV programme data across 24 Karnataka districts, alongside institutional "
            "data from District Legal Services Authorities (DLSAs)."
        ),
        "approach": (
            "Compared PLV self-descriptions of their role against how DLSAs describe and use PLVs, "
            "across districts and across recruitment backgrounds (law-background vs. "
            "community-recruited)."
        ),
        "evidence_outcome": (
            "No institution agrees on what a PLV actually is. DLSAs tend to see PLVs as an "
            "extension of the formal legal system; PLVs themselves describe the work more in the "
            "language of social work, with legal knowledge as one tool among many."
        ),
        "what_worked": (
            "In districts with strong outcomes, it traced back to one specific official choosing "
            "to actively engage with PLVs."
        ),
        "what_failed": (
            "There is no standing process that guarantees this engagement continues if that one "
            "official moves on or loses interest."
        ),
        "why_worked_or_failed": (
            "Success currently depends on individual motivation, not structural design — no one "
            "is clearly responsible for monitoring PLVs once training ends."
        ),
        "conditions": (
            "Requires the programme to explicitly decide who \"owns\" the PLV role and who is "
            "responsible for it after training concludes."
        ),
        "cautions": (
            "Before recruiting for a similar frontline role, ask whose existing labour the new "
            "title is sitting on top of — new roles tend to default to recruiting from the same "
            "already-overburdened pool (e.g. ASHA/Anganwadi workers)."
        ),
        "would_do_differently": (
            "Build a route that directs PLVs from a legal background toward formal legal aid work, "
            "and community-recruited PLVs toward direct practical action, instead of treating all "
            "PLVs identically."
        ),
        "key_takeaway": (
            "When one person holds multiple frontline titles, no system currently accounts for "
            "the added administrative burden of navigating separate reporting lines across "
            "departments that don't talk to each other."
        ),
    },
    {
        "org_key": "kslsa",
        "title": "Deployment Without a System: Why PLV Impact Depends on One Person",
        "status": "approved",
        "sector": ["Access to Justice", "Legal Aid Training"],
        "target_group": ["Frontline Community Workers"],
        "geography": "Karnataka (state-wide, 24 districts)",
        "tags": ["PLV", "deployment", "compensation", "training design"],
        "problem": "Deployment of PLVs into courts and police stations is informal and ad hoc rather than strategic.",
        "context": (
            "Same 24-district OTR review; recommendations emerged from small groups examining "
            "regional deployment and compensation data independently."
        ),
        "approach": (
            "Reviewed deployment patterns, stipend structures, and training cycles across "
            "districts to identify what actually drives PLV effectiveness on the ground."
        ),
        "evidence_outcome": (
            "The single strongest predictor of PLV success was how engaged the local official "
            "happened to be — not any institutional standard."
        ),
        "what_worked": (
            "A longer, more structured training cycle this year was seen as an improvement; PLVs "
            "increasingly describe welfare schemes as rights rather than favours."
        ),
        "what_failed": (
            "Training tries to cover too many topics at once, four days isn't enough, and there's "
            "no structured follow-up afterward; deployment has no clear coordination with local "
            "police."
        ),
        "why_worked_or_failed": (
            "There's no standing coordination structure between PLVs and institutions like police "
            "— the intermediary is left to navigate bureaucracy and escalate problems mostly alone."
        ),
        "conditions": (
            "A police liaison at every courthouse and a defined escalation/protection pathway for "
            "PLVs would remove dependence on one engaged official."
        ),
        "cautions": (
            "Incentive structures for compensation can unintentionally push PLVs toward easier, "
            "more \"rewarded\" cases and away from harder, less incentivised ones — incentive "
            "design matters as much as incentive size."
        ),
        "would_do_differently": (
            "Build standing multi-actor coordination between institutions from the start, instead "
            "of making the PLV the only one responsible for translating between systems."
        ),
        "key_takeaway": (
            "When success depends on one engaged individual rather than structural design, that's "
            "a governance risk, not a success story."
        ),
    },
    {
        "org_key": "kslsa",
        "title": "Bridging the Formal and the Informal",
        "status": "approved",
        "sector": ["Access to Justice", "Policy"],
        "target_group": ["Frontline Community Workers"],
        "geography": "Karnataka (state-wide, 24 districts)",
        "tags": ["PLV", "district variation", "governance", "training"],
        "problem": (
            "Training has visibly shifted DLSA officials' views of PLVs from real skepticism to "
            "much more confidence — but that shift in belief hasn't reliably translated into a "
            "shift in practice."
        ),
        "context": (
            "Cross-district comparison within the same OTR review, looking at enrollment, "
            "confidence scores, and deployment outcomes by district."
        ),
        "approach": (
            "Compared district-level outcomes against local factors such as outreach intensity, "
            "law-student PLV concentration, and local lawyer density."
        ),
        "evidence_outcome": (
            "Districts with strong outreach saw far higher PLV enrollment; districts with almost "
            "no structured outreach had very low female PLV participation; a couple of districts "
            "saw confidence scores drop after training, possibly linked to PLVs rarely or never "
            "being deployed."
        ),
        "what_worked": (
            "Districts with higher concentrations of law-student PLVs, or higher local lawyer "
            "density, tended to see better outcomes overall."
        ),
        "what_failed": (
            "Word-of-mouth is still the main way PLVs learn about the programme in many districts, "
            "leaving many feeling isolated when navigating authorities alone."
        ),
        "why_worked_or_failed": (
            "There's an unresolved tension between treating this work as \"social work\" versus "
            "\"an extension of the formal legal system\" — that tension, not a lack of training, "
            "is the actual bottleneck."
        ),
        "conditions": (
            "A shared, cross-organisational framework defining scope and expectations for the "
            "role — similar to how ASHA workers eventually got a defined scope of practice — is "
            "what this needs."
        ),
        "cautions": (
            "A district's positive result traced to one highly engaged official is a fragile win, "
            "not a template — it depended on a person, not a system."
        ),
        "would_do_differently": (
            "Move from more training toward a shared framework defining scope and expectations "
            "across organisations, not just within one programme."
        ),
        "key_takeaway": (
            "This tension shows up anywhere community justice models are built in India — the fix "
            "is a framework, not more training hours."
        ),
    },
    {
        "org_key": "kslsa",
        "title": "Confusion Regarding Funds: What Districts Don't Track",
        "status": "pending",
        "sector": ["Access to Justice", "Funding & Compensation"],
        "target_group": ["Frontline Community Workers"],
        "geography": "Karnataka (state-wide, 24 districts)",
        "tags": ["PLV", "compensation", "funding", "transparency"],
        "problem": (
            "Stipend structures vary widely by district, and many DLSAs don't have a clear "
            "process for budgeting PLV compensation at all."
        ),
        "context": "Emerged from the compensation-focused discussion track during the same OTR peer-review session.",
        "approach": (
            "Small groups compared what PLVs reported being paid, or being unsure about, against "
            "what DLSAs reported budgeting."
        ),
        "evidence_outcome": (
            "Some PLVs were not even sure if they're paid for training days — pointing to a "
            "tracking and communication gap, not necessarily a funding shortage alone."
        ),
        "what_worked": None,
        "what_failed": (
            "Ad hoc, district-by-district stipend decisions with no shared process or "
            "transparency to the PLVs affected by them."
        ),
        "why_worked_or_failed": (
            "No one is clearly responsible for PLV compensation once training ends, mirroring the "
            "same \"no single administrator\" gap seen in role definition."
        ),
        "conditions": (
            "A clear, shared budgeting process communicated directly to PLVs before they start "
            "would remove the ambiguity."
        ),
        "cautions": (
            "Don't assume \"we pay PLVs\" is enough — if PLVs themselves are unsure what they're "
            "entitled to, that's a communication failure independent of the amount."
        ),
        "would_do_differently": (
            "Publish a simple compensation policy PLVs can reference themselves, rather than "
            "routing every question through a district official."
        ),
        "key_takeaway": (
            "Compensation confusion doesn't just cause frustration — it can quietly steer PLVs "
            "toward easier, better-understood cases and away from harder ones."
        ),
    },
    {
        "org_key": "kslsa",
        "title": "A Shared Repository Was the Ecosystem's Own Idea",
        "status": "pending",
        "sector": ["Policy", "Access to Justice"],
        "target_group": ["Organisations Entering Legal Aid"],
        "geography": "Karnataka, sector-wide",
        "tags": ["knowledge sharing", "peer review", "ecosystem"],
        "problem": "Valuable programme learnings from legal-aid interventions typically stay locked inside the organisation that generated them.",
        "context": (
            "Emerged directly from OTR participant discussions on what the sector needs next, "
            "after reviewing the PLV programme data together."
        ),
        "approach": (
            "Asked OTR participants — researchers, lawyers, policy practitioners, data analysts — "
            "what would help beyond this one workshop."
        ),
        "evidence_outcome": (
            "Three ideas recurred independently: a cross-organisational review board for "
            "programme design, a shared public repository for legal-aid insights, and a stronger "
            "support system connecting frontline workers across roles."
        ),
        "what_worked": (
            "Opening one organisation's raw data to independent peer review, with no heavy "
            "direction, surfaced patterns no single organisation had named on its own."
        ),
        "what_failed": (
            "Without a shared, ongoing home for these insights, each future OTR-style session "
            "risks re-discovering the same lessons in isolation."
        ),
        "why_worked_or_failed": (
            "Peer scrutiny works because reviewers aren't invested in defending the programme's "
            "existing design — but that value is wasted if the output isn't kept and reused."
        ),
        "conditions": (
            "Requires a facilitator role (running the workshop, curating groups, handling "
            "logistics) so presenting organisations can focus on the questions they want the room "
            "to engage with."
        ),
        "cautions": (
            "A repository is only as trustworthy as its review process — publishing raw peer "
            "discussion without any verification step would undermine exactly the trust it's "
            "meant to build."
        ),
        "would_do_differently": (
            "Design the repository alongside the next OTR session, not after several sessions "
            "have already generated learnings with nowhere to go."
        ),
        "key_takeaway": (
            "The demand for a shared repository didn't come from a platform team — it came "
            "directly from the people already doing the peer-review work."
        ),
    },
    {
        "org_key": "haveri",
        "title": "Interactive, Local-Language Training Reduced Fear of Police Non-Response",
        "status": "approved",
        "sector": ["Legal Aid Training"],
        "target_group": ["Women", "Frontline Community Workers"],
        "geography": "Haveri district, Karnataka",
        "tags": ["PLV", "Haveri", "training design", "trust-building"],
        "problem": (
            "A past negative experience with police response to a domestic violence complaint had "
            "left several respondents believing the legal system offered no real recourse, before "
            "training."
        ),
        "context": (
            "Composite survey of 9 respondents in Haveri district (predominantly women): Anganwadi "
            "workers/teachers, MSW students, a farmers'-organisation office-bearer, a homeguard, "
            "and a yoga teacher — most first-time PLVs."
        ),
        "approach": (
            "Interactive, \"Nali Kali\"-style teaching was used to explain which authority to "
            "approach and how, for the issues respondents actually encounter: domestic violence, "
            "child marriage, and POCSO cases."
        ),
        "evidence_outcome": (
            "Several respondents described a marked reduction in fear of engaging with legal "
            "authorities after training specifically clarified that free legal aid and DLSA "
            "channels exist and function independently of police responsiveness."
        ),
        "what_worked": (
            "Naming the exact source of distrust (police non-response) and explaining why the "
            "DLSA pathway is separate from it, rather than teaching legal content in the abstract."
        ),
        "what_failed": None,
        "why_worked_or_failed": (
            "Respondents' skepticism was rooted in one specific past experience, not a general "
            "lack of legal knowledge — addressing that experience directly is what shifted "
            "confidence, not legal content on its own."
        ),
        "conditions": "Training needs to explicitly name and address the specific past experience skepticism is rooted in.",
        "cautions": (
            "A general \"the system works\" message will not overcome distrust rooted in a "
            "specific bad experience — it has to be addressed by name."
        ),
        "would_do_differently": None,
        "key_takeaway": (
            "Confidence gains come from directly addressing the specific reason people distrust "
            "the system, not from general legal education alone."
        ),
    },
    {
        "org_key": "chikkaballapur",
        "title": "Long-Tenured PLVs Want Validation, New PLVs Want Courage",
        "status": "pending",
        "sector": ["Legal Aid Training"],
        "target_group": ["Frontline Community Workers", "Transgender Community"],
        "geography": "Chikkaballapur district, Karnataka",
        "tags": ["PLV", "Chikkaballapur", "training design", "PLV tenure"],
        "problem": "The same training is given to both brand-new and multi-year PLVs, despite them needing different things from it.",
        "context": (
            "Composite survey of 10 respondents in Chikkaballapur: law students, long-tenured "
            "Anganwadi workers (some with decades of community work), a transgender-rights NGO "
            "worker, and general social workers, several with 5–10 years of PLV tenure."
        ),
        "approach": "Compared how long-tenured versus newer PLVs described what the training actually gave them.",
        "evidence_outcome": (
            "Long-tenured respondents described the training as validating and formalising work "
            "they already did; newer respondents described a marked increase in courage to "
            "question authority and support people through the legal process."
        ),
        "what_worked": (
            "For long-tenured PLVs, training that formalises existing informal practice; for new "
            "PLVs, training that explicitly builds courage to engage authority."
        ),
        "what_failed": (
            "Several long-tenured PLVs described facing initial community resistance when first "
            "nominated for the role — something current training doesn't address at all."
        ),
        "why_worked_or_failed": (
            "The same content serves two different psychological needs depending on tenure — "
            "validation versus courage-building — and isn't currently tailored to either."
        ),
        "conditions": "Segmenting training tracks or follow-up content by tenure could serve both groups better than one shared format.",
        "cautions": (
            "Don't assume experience means less support is needed — long-tenured PLVs still face "
            "community resistance that newer, formally-badged PLVs may not."
        ),
        "would_do_differently": (
            "Add a track specifically addressing how experienced community workers navigate "
            "resistance when their informal work becomes an official, visible role."
        ),
        "key_takeaway": (
            "The same training can succeed for opposite reasons depending on who's in the room — "
            "tenure changes what \"success\" even means for a participant."
        ),
    },
    {
        "org_key": "kolar",
        "title": "Cybercrime Awareness Is Missing From Standard PLV Training",
        "status": "approved",
        "sector": ["Legal Aid Training", "Access to Justice"],
        "target_group": ["Transgender Community", "Frontline Community Workers"],
        "geography": "Kolar district, Karnataka",
        "tags": ["PLV", "Kolar", "cybercrime", "training gaps"],
        "problem": (
            "PLVs report handling cybercrime and workplace harassment (POSH) cases despite these "
            "areas being rarely covered in standard legal-aid training."
        ),
        "context": (
            "Composite survey of 5 respondents in Kolar: long-tenured community/NGO-affiliated "
            "PLVs, a civic-organisation representative, and PLVs working specifically with the "
            "transgender community."
        ),
        "approach": "Compared respondents' self-reported case exposure against what the standard training curriculum actually covers.",
        "evidence_outcome": (
            "Respondents specifically flagged POCSO and cybercrime awareness as rarely covered in "
            "standard trainings despite encountering it in practice; transgender respondents "
            "raised employment discrimination and demeaning (verbal) treatment by police as "
            "recurring, unaddressed issues."
        ),
        "what_worked": (
            "Training that was unusually substantive and engaging compared to prior sessions — "
            "particularly validating for transgender respondents."
        ),
        "what_failed": "Standard curricula still under-cover cybercrime and don't address non-physical mistreatment PLVs face from authorities themselves.",
        "why_worked_or_failed": "Curriculum design reflects historical common-case patterns rather than the case exposure PLVs currently report in the field.",
        "conditions": "Curriculum review needs an ongoing feedback loop from PLVs' actual case exposure, not a fixed syllabus revisited occasionally.",
        "cautions": (
            "PLVs who themselves face discrimination (e.g. transgender PLVs) may encounter "
            "barriers from the very authorities they're meant to liaise with — that's a distinct "
            "support need, not just a training gap."
        ),
        "would_do_differently": (
            "Add cybercrime and POSH modules, and build an explicit protocol for PLVs experiencing "
            "mistreatment from police or administration themselves."
        ),
        "key_takeaway": "Training content should track what PLVs are actually encountering in the field, not what the programme assumed at design time.",
    },
]


def seed_posts(org_ids: dict[str, str], admin_id: str) -> None:
    for post in SEED_POSTS:
        org_id = org_ids[post["org_key"]]
        pid = post_id_for(post["title"])
        existing = (
            supabase.table("posts")
            .select("id,status")
            .eq("id", pid)
            .limit(1)
            .execute()
        )
        if existing.data:
            status = existing.data[0]["status"]
            org_name = ORGS[post["org_key"]]["name"]
            print(f"Kept existing: {post['title']} — {org_name} [{status}]")
            continue

        embedding_source = f"{post['title']}. {post['problem']} {post['key_takeaway']}"
        embedding = get_embedding(embedding_source)

        row = {k: v for k, v in post.items() if k != "org_key"}
        row["id"] = pid
        row["org_id"] = org_id
        if post["title"] in CASE_IMAGES:
            row["image_url"] = CASE_IMAGES[post["title"]]
        if embedding is not None:
            row["embedding"] = embedding
        if post["status"] == "approved":
            row["approved_by"] = admin_id
            row["approved_at"] = datetime.now(timezone.utc).isoformat()

        supabase.table("posts").insert(row).execute()
        note = "" if embedding is not None else " (no embedding)"
        org_name = ORGS[post["org_key"]]["name"]
        print(f"Seeded: {post['title']} — {org_name} [{post['status']}]{note}")


if __name__ == "__main__":
    print("Seeding OUTLAWED OTR demo data...")
    admin_id = seed_admin()
    seed_reader()
    org_ids = seed_organizations()
    seed_posts(org_ids, admin_id)
    print("Done.")
    print(
        "\nThree access surfaces are seeded: reader@seed.outlawedotr.local, "
        "verified organization accounts, and admin.outlawedindia@seed.outlawedotr.local."
    )
    print(
        "\nRamanagara DLSA is seeded as a PENDING application with zero posts — "
        "approve or reject it from the admin Verifications queue to demo that flow."
    )
