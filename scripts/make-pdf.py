"""Generate a test PDF for RAG system testing."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib import colors

OUT = "/home/z/my-project/scripts/test-doc.pdf"

doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    leftMargin=0.8*inch, rightMargin=0.8*inch,
    topMargin=0.8*inch, bottomMargin=0.8*inch,
)

styles = getSampleStyleSheet()
h1 = styles["Heading1"]
h2 = styles["Heading2"]
body = ParagraphStyle(
    "BodyCustom", parent=styles["BodyText"],
    fontSize=10.5, leading=14, spaceAfter=6,
)

story = []

story.append(Paragraph("Z.ai Engineering Handbook", h1))
story.append(Spacer(1, 12))
story.append(Paragraph(
    "This document describes the engineering practices, deployment workflow, "
    "and on-call procedures used by the Z.ai platform team. It is intended for "
    "all engineers joining the team.", body))
story.append(Spacer(1, 18))

story.append(Paragraph("1. Team Structure", h2))
story.append(Paragraph(
    "The platform team consists of 12 engineers split across three squads: "
    "Infrastructure (4 people), Application Platform (5 people), and Developer "
    "Experience (3 people). Each squad has one tech lead who reports to the "
    "VP of Engineering, Priya Sharma.", body))
story.append(Spacer(1, 12))

story.append(Paragraph("2. Deployment Workflow", h2))
story.append(Paragraph(
    "All production deployments use the following workflow: pull request → "
    "automated CI tests → code review by two engineers → merge to main → "
    "auto-deploy to staging → smoke tests → manual promotion to production. "
    "The average deployment takes 18 minutes from merge to production.", body))
story.append(Paragraph(
    "Production deploys happen on Tuesdays and Thursdays between 10 AM and "
    "2 PM Pacific Time. Hotfixes can be deployed at any time but require "
    "approval from the on-call engineer and the tech lead of the affected squad.", body))
story.append(Spacer(1, 12))

story.append(Paragraph("3. On-Call Rotation", h2))
story.append(Paragraph(
    "The on-call rotation is weekly, running Monday to Monday. Each engineer "
    "is on-call approximately once every 6 weeks. The on-call engineer receives "
    "a $400 stipend per week of on-call duty. Critical alerts are routed via "
    "PagerDuty and must be acknowledged within 5 minutes.", body))
story.append(Spacer(1, 12))

story.append(Paragraph("4. Infrastructure", h2))
story.append(Paragraph(
    "Production infrastructure runs on AWS in the us-west-2 region. The "
    "stack includes: EKS for Kubernetes, RDS Postgres for relational data, "
    "ElastiCache Redis for caching, S3 for object storage, and CloudFront "
    "for CDN. Monthly infrastructure cost averages $42,000.", body))
story.append(Spacer(1, 12))

story.append(Paragraph("5. SLA and Uptime", h2))
story.append(Paragraph(
    "The platform SLA is 99.95% monthly uptime for the API tier. In Q3 2025, "
    "actual uptime was 99.97%. The largest source of downtime was a 23-minute "
    "outage on August 14 caused by a misconfigured load balancer.", body))

doc.build(story)
print(f"PDF written: {OUT}")
