![Uploading tswira.png…]()
# Hackathon MedConnect — `aiv4_demo/`

This folder is the **hackathon hand-off bundle**.


> 🌍 **The API itself is multilingual** — see §4 of either guide. The `/en/`, `/fr/`, `/ar/`, `/tr/`, `/de/`, `/nl/`, `/pt/`, `/ru/`, `/es/`, `/uz/` segment in the URL controls only the **language of the response labels**. Detection is identical across all languages, which makes multilingual UX (e.g. French + Arabic + English in Morocco) essentially free — submit once, GET in as many languages as you want.

## Quick start (60 seconds)

```bash
pip install -r requirements.txt

# Replace XXXX and HACKxx with the values from your team's row in §3 of the guide.
python scripts/dev/validate_api_key.py --api-key XXXX --facility-code HACKxx
```

Expected output within ~5–30 s:

```
OK — analysis returned in 4s, slug=...
     teeth detected: 32, pathologies: 33
     annotated overlay: https://aiv4.thakaamed.com/media/drawed_images/<id>_drawed.png
     embedded viewer:   https://aiv4.thakaamed.com/en/embeded_diagnosis/<id>
```

That `annotated overlay` URL is a ready-to-display PNG with bounding boxes drawn on it. The `embedded viewer` URL is an interactive web view you can drop straight into an `<iframe>`. Both are huge time-savers for visual demos — see §5 of the guide for details.

If you prefer curl (needs `jq`):

```bash
API_KEY=XXXX FACILITY_CODE=HACKxx bash scripts/dev/curl_test.sh
```

## Files you'll actually use

| Path | Purpose |
|---|---|
| `HACKATHON_GUIDE_{FR,EN}.{md,docx}` | The full guide — endpoint, multilingual notes, snippets, 12 challenge ideas, FAQ |
| `scripts/dev/validate_api_key.py` | 60-second smoke test that your key + facility code work |
| `scripts/dev/curl_test.sh` | Same smoke test from the shell |
| `data/samples/panoramic/` | 41 anonymised panoramic radiographs (~25 MB) |
| `data/samples/bitewing/` | 113 anonymised intra-oral radiographs (RVG / periapical) |
| `examples/sample_v23_submission.json` | Real POST response (296 B) |
| `examples/sample_v23_analysis.json` | Real GET response (~1.3 MB) — full v2.3 schema, explore offline without burning tokens |

## About the sample images

All 154 radiographs in `data/samples/` have been **anonymised**:
- ✅ EXIF metadata stripped
- ✅ JPEG comment markers removed
- ✅ Original patient IDs and acquisition dates dropped from filenames
- ✅ Visual inspection: no patient name / DOB / clinic ID burned into the images (only standard L/R anatomical orientation markers)

You can use them freely for development, testing, and demo videos.
