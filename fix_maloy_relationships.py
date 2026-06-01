#!/usr/bin/env python3
"""
Fix Maloy family relationships:
- Margaret MacLucas (t0:I28141302906) is James H Maloy Sr.'s second wife (m. ~1928, after Emma's death 1926).
- She is NOT the biological mother of Ruth, James H (1922), John, or Grace — Emma Joan Flavin (t0:I18635672053) is.
- She has no biological children and no direct line to any descendant.
- Also clean up James Henry Maloy b. 1964 (t0:I18635654544) — he is the grandson, not a sibling. He
  was incorrectly listed as a child of F32 (Sr+Emma) with bogus parent_ids.
"""
import json, sys

PATHS = ["client/src/data.json"]

SR = "t0:I18635670923"      # James H Maloy Sr. 1884-1944
EMMA = "t0:I18635672053"    # Emma Joan Flavin 1889-1926 (biological mother)
MARGARET = "t0:I28141302906" # Margaret MacLucas 1889-1968 (stepmother)
F32 = "t0:F32"               # Sr + Emma (biological family)
F19 = "t0:F19"               # Sr + Margaret (no children — second marriage)

# Biological children of Sr + Emma
BIO_CHILDREN = [
    "t0:I18635731419",  # Ruth Esther
    "t0:I18635645027",  # James H (1922)
    "t0:I18635731420",  # John
    "t0:I18635731421",  # Grace
]
JHM_JR_1964 = "t0:I18635654544"  # James Henry Maloy b. 1964 — actually grandson, child of James H 1922 + wife

def fix(path):
    with open(path) as f:
        data = json.load(f)
    
    changed = 0
    
    # 1. Fix biological children: parent_ids = [Sr, Emma]; family_child_ids = [F32 only]
    for p in data["individuals"]:
        if p["id"] in BIO_CHILDREN:
            new_parents = [SR, EMMA]
            if p.get("parent_ids") != new_parents:
                p["parent_ids"] = new_parents
                changed += 1
            new_fc = [F32]
            if p.get("family_child_ids") != new_fc:
                p["family_child_ids"] = new_fc
                changed += 1
    
    # 2. Fix James Henry Maloy (1964) — grandson, not a sibling
    #    Real parents: James H Maloy 1922 (t0:I18635645027) + wife (t0:I18635646682)
    for p in data["individuals"]:
        if p["id"] == JHM_JR_1964:
            new_parents = ["t0:I18635645027", "t0:I18635646682"]
            if p.get("parent_ids") != new_parents:
                p["parent_ids"] = new_parents
                changed += 1
            new_fc = ["t0:F11"]  # Sr 1922 + wife
            if p.get("family_child_ids") != new_fc:
                p["family_child_ids"] = new_fc
                changed += 1
            # Clean spouse_ids/child_ids if they accidentally include himself / his uncles
            # His spouse: separate person (we leave that intact if real)
            # His children: keep only those whose parent_ids point to him
            real_children = []
            for c in p.get("child_ids", []):
                cp = next((x for x in data["individuals"] if x["id"] == c), None)
                if cp and JHM_JR_1964 in (cp.get("parent_ids") or []):
                    real_children.append(c)
            if p.get("child_ids") != real_children:
                p["child_ids"] = real_children
                changed += 1
            # Clean spouses — remove his father & grandfather if listed
            cleaned_spouses = [s for s in (p.get("spouse_ids") or []) 
                              if s not in (SR, "t0:I18635645027")]
            if p.get("spouse_ids") != cleaned_spouses:
                p["spouse_ids"] = cleaned_spouses
                changed += 1
            # Clean family_spouse_ids — keep only families where he is husband/wife
            cleaned_fs = []
            for fid in (p.get("family_spouse_ids") or []):
                fam = next((f for f in data["families"] if f["id"] == fid), None)
                if fam and JHM_JR_1964 in (fam.get("husband_id"), fam.get("wife_id")):
                    cleaned_fs.append(fid)
            if p.get("family_spouse_ids") != cleaned_fs:
                p["family_spouse_ids"] = cleaned_fs
                changed += 1
    
    # 3. Fix Margaret MacLucas — second wife only, no children
    for p in data["individuals"]:
        if p["id"] == MARGARET:
            if p.get("child_ids"):
                p["child_ids"] = []
                changed += 1
            # spouse_ids stays = [SR], family_spouse_ids stays = [F19], family_child_ids = her own parents
    
    # 4. Fix Emma — make sure her child_ids are exactly the 4 biological children (drop 1964 grandson)
    for p in data["individuals"]:
        if p["id"] == EMMA:
            if set(p.get("child_ids", [])) != set(BIO_CHILDREN):
                p["child_ids"] = BIO_CHILDREN[:]
                changed += 1
    
    # 5. Fix James H Maloy Sr. — child_ids should be the 4 biological + any later kids (here just the 4)
    for p in data["individuals"]:
        if p["id"] == SR:
            current = p.get("child_ids", [])
            # Remove grandson if listed
            cleaned = [c for c in current if c != JHM_JR_1964]
            # Ensure all 4 bio kids present
            for c in BIO_CHILDREN:
                if c not in cleaned:
                    cleaned.append(c)
            if cleaned != current:
                p["child_ids"] = cleaned
                changed += 1
    
    # 6. Fix F32 (Sr + Emma) — children = BIO_CHILDREN (no grandson)
    for fam in data["families"]:
        if fam["id"] == F32:
            if fam.get("children_ids") != BIO_CHILDREN:
                fam["children_ids"] = BIO_CHILDREN[:]
                changed += 1
    
    # 7. Fix F19 (Sr + Margaret) — no children
    for fam in data["families"]:
        if fam["id"] == F19:
            if fam.get("children_ids"):
                fam["children_ids"] = []
                changed += 1
    
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"{path}: {changed} field updates")

if __name__ == "__main__":
    for p in PATHS:
        fix(p)
