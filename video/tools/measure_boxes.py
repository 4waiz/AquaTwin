"""Measure 1920x1080 bounding boxes of UI regions used for push-ins (developer utility)."""
import json
from playwright.sync_api import sync_playwright
BASE = "http://localhost:3200"
out = {}
def box(page, sel, key, nth=0):
    loc = page.locator(sel).nth(nth)
    b = loc.bounding_box()
    out[key] = [round(b["x"]), round(b["y"]), round(b["width"]), round(b["height"])] if b else None
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"])
    ctx = b.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()
    page.goto(BASE + "/about?intro=0"); page.evaluate("() => sessionStorage.setItem('aquatwin.intro.v1','1')")
    page.goto(BASE + "/twin?intro=0&quality=high"); page.wait_for_timeout(6000)
    box(page, "section:has-text('Hybrid estimate')", "twin_hybrid_panel")
    box(page, "section:has(h2:text-is('RO train 2'))", "twin_inspector")
    box(page, "text=Physics · 0D", "twin_eq_phys")
    box(page, "text=AquaTwin >> nth=0", "twin_any")
    page.goto(BASE + "/scenarios?s=salinity&intro=0&quality=high"); page.wait_for_selector("text=Constraint violations", timeout=60000); page.wait_for_timeout(1500)
    box(page, "section:has-text('Constraint violations')", "scen_outcome")
    box(page, "section:has(h2:text-is('Permeate TDS'))", "scen_tds_chart")
    box(page, "role=slider[name='Scenario time']", "scen_timeline")
    page.get_by_role("tab", name="No action").click(); page.get_by_role("button", name="+6h").click(); page.wait_for_timeout(1200)
    box(page, "text=Constraint violated", "scen_violated_chip")
    page.goto(BASE + "/optimization?intro=0&quality=high"); page.wait_for_selector("text=RECOMMENDATION APPROVED", timeout=60000); page.wait_for_timeout(800)
    box(page, "section:has(svg[aria-label^='Candidate strategies'])", "opt_scatter_panel")
    box(page, "text=RECOMMENDATION APPROVED", "opt_banner")
    box(page, "section:has-text('Recommended strategy')", "opt_right_panel")
    page.goto(BASE + "/intelligence?intro=0&quality=high"); page.wait_for_timeout(5000)
    page.get_by_role("button", name="Compound extreme").click(); page.wait_for_timeout(1500)
    box(page, "section:has-text('Out-of-distribution probe')", "int_probe")
    box(page, "text=LOW MODEL CONFIDENCE", "int_banner_text")
    box(page, "text=Confidence >> nth=0", "int_conf")
    page.goto(BASE + "/validation?intro=0&quality=high"); page.wait_for_timeout(4000)
    box(page, "section:has-text('Prediction accuracy')", "val_accuracy")
    box(page, "section:has-text('Closed-loop experiments')", "val_closed")
    b.close()
print(json.dumps(out, indent=1))
json.dump(out, open("video/tools/boxes.json", "w"), indent=1)
