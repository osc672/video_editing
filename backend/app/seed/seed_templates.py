"""Seed the `templates` table from app/seed/catalog.json.

Usage (from the backend folder, with the backend venv active):

    python -m app.seed.seed_templates

Re-running is safe: templates are matched on their `fx` name and updated in
place, so option tweaks in the catalog are picked up on every run.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base, Template  # noqa: E402

CATALOG_PATH = Path(__file__).resolve().parent / "catalog.json"


def load_catalog() -> list[dict]:
    with CATALOG_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)["templates"]


def seed() -> int:
    Base.metadata.create_all(bind=engine)
    templates = load_catalog()
    created = updated = 0

    with SessionLocal() as db:
        existing = {t.fx: t for t in db.scalars(select(Template)).all()}

        for item in templates:
            options = item.get("options", [])
            row = existing.get(item["fx"])
            if row is None:
                row = Template(fx=item["fx"])
                db.add(row)
                created += 1
            else:
                updated += 1

            row.number = item["number"]
            row.name = item["name"]
            row.category = item["category"]
            row.description = item["description"]
            row.options_json = options
            row.needs_images = bool(item.get("needs_images"))
            row.thumbnail_url = f"/static/templates/{item['number']}.jpg"
            row.enabled = True

        db.commit()

    print(f"Seeded {len(templates)} templates ({created} new, {updated} updated).")
    return len(templates)


if __name__ == "__main__":
    total = seed()
    print(f"Done. {total} templates available in the gallery.")
