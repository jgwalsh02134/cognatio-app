"""Add `affiliations` field to specific individuals in both data.json files."""
import json
from pathlib import Path

# Standard Knights of Malta affiliation
def kom(note):
    return {
        "key": "knights_of_malta",
        "name": "Knights of Malta",
        "role": "Member",
        "dates": None,
        "note": note,
    }


AFFILIATIONS = {
    # John Gaynor Walsh (Albany, NY · d. San Francisco 1953)
    "t0:I19739309279": [
        {
            "key": "harvard",
            "name": "Harvard University",
            "role": "A.B., Class of 1913",
            "dates": "1909\u20131913",
            "note": "Confirmed in three Harvard Class of 1913 reports. Senior Class Report (1913): 'J. G. Walsh, 31 State St., Albany, N. Y.' Quinquennial Report (~1918): 'Walsh, John G., 2d District Public Service Commission, Albany, N. Y.' Decennial / Anniversary Report (1923): 'Walsh, John G., District Public Service Commission, Albany, N. Y.'",
        },
        {
            "key": "ny_public_service_commission",
            "name": "New York State Public Service Commission \u2014 2nd District",
            "role": "Staff (Albany)",
            "dates": "by 1918 \u2014 1923+",
            "note": "Listed at the 2nd District Public Service Commission, Albany, in both the Harvard Class of 1913 Quinquennial Report (~1918) and Decennial Report (1923).",
        },
        {
            "key": "southern_pacific",
            "name": "Southern Pacific Railroad",
            "role": "Vice President \u2014 Finance",
            "dates": None,
            "note": "Family record \u2014 later in his career served as Vice President for Finance at the Southern Pacific Company; died in San Francisco (SP corporate headquarters) on 28 Aug 1953. Not yet documented in primary sources.",
        },
        kom("Family record \u2014 member of the Knights of Malta (Catholic chivalric order)."),
    ],
    # James H. Maloy (1922\u20132003) \u2014 confirmed in Times Union obituary 9 Feb 2003
    "t0:I18635645027": [
        kom("Confirmed in Albany Times Union obituary (9 Feb 2003): \u201che was a member of the Motor Truck Association, the Association of General Contractors, the Knights of Columbus, the Knights of Malta\u2026\u201d"),
    ],
    # John E. Maloy (brother of James, of Loudonville) \u2014 family record
    "t0:I18635731420": [
        kom("Family record \u2014 member of the Knights of Malta (Catholic chivalric order)."),
    ],
    # Raymond C. Dugan (1930\u2013), Troy NY \u2014 U.S. Army Medical Corpsman 1952\u20131954
    "t0:I19739345716": [
        {
            "key": "siena_college",
            "name": "Siena College",
            "role": "B.S., Pre-Medicine",
            "dates": None,
            "note": "Earned a B.S. in pre-med from Siena College (Loudonville, NY) after his service in the U.S. Army Medical Corps during the Korean War.",
        },
        {
            "key": "rpi",
            "name": "Rensselaer Polytechnic Institute",
            "role": "M.A., Advanced Business Management",
            "dates": None,
            "note": "Earned an M.A. in advanced business management from RPI (Troy, NY); retired as Vice President of Marketing and Sales at Lydall, Manning Inc., Green Island, NY.",
        },
    ],
    # Walter J. Dugan (1922\u20132013) \u2014 USS LST-491 Engineering Officer
    "t0:I19739345719": [
        {
            "key": "rpi",
            "name": "Rensselaer Polytechnic Institute",
            "role": "Engineering Student",
            "dates": "\u20131942",
            "note": "Studying engineering at RPI (Troy, NY) when he enlisted in the U.S. Navy in 1942.",
        },
        {
            "key": "cornell",
            "name": "Cornell University",
            "role": "Engineering (continued postwar)",
            "dates": None,
            "note": "Continued engineering studies at Cornell University (Ithaca, NY) after WWII naval service.",
        },
    ],
    # Daniel J. Riordan (1870\u20131923) \u2014 U.S. Congressman, Manhattan College alumnus
    "t0:I19744303987": [
        {
            "key": "manhattan_college",
            "name": "Manhattan College",
            "role": "Undergraduate",
            "dates": "1886\u20131890",
            "note": "Entered Manhattan College in 1886 and graduated in 1890 (Wikipedia, citing the Biographical Directory of the United States Congress).",
        },
        {
            "key": "us_house_of_representatives",
            "name": "U.S. House of Representatives",
            "role": "Member of Congress \u2014 New York",
            "dates": "1899\u20131901; 1906\u20131923",
            "note": "Democrat. Elected to the 56th Congress (March 4, 1899 \u2013 March 3, 1901). Returned to the House on November 6, 1906 to fill the vacancy caused by Timothy D. Sullivan's resignation; re-elected to the 60th and seven succeeding Congresses, serving until his death on April 28, 1923. Also a member of the New York State Senate (10th District), 1903\u20131906.",
        },
    ],
    # John Gaynor Walsh III (b. 1951)
    "t0:I18635651111": [
        {
            "key": "westminster_college",
            "name": "Westminster College (Missouri)",
            "role": "B.A., Sociology",
            "dates": "\u20131973",
            "note": "B.A. in Sociology, 1973 \u2014 Westminster College, Fulton, Missouri (the historic liberal-arts college famous for Churchill's 1946 'Iron Curtain' address).",
        },
    ],
    # James Gregory Walsh (b. 1988) \u2014 Siena College / Loudonville
    "t0:I18635653381": [
        {
            "key": "siena_college",
            "name": "Siena University",
            "role": "Undergraduate",
            "dates": "\u20132014",
            "note": "Attended Siena University (formerly Siena College), Loudonville, NY \u2014 graduated 2014.",
        },
    ],
    # Debra Ruth Maloy (b. 1956)
    "t0:I18635645026": [
        {
            "key": "manhattanville_college",
            "name": "Manhattanville University",
            "role": "B.A., Psychology",
            "dates": "\u20131978",
            "note": "B.A. in Psychology, 1978 \u2014 Manhattanville College (now Manhattanville University), Purchase, New York.",
        },
    ],
    # Alison Cranwell Walsh (b. 1986) \u2014 PC '08, Fordham M.A. '10
    "t0:I18635652207": [
        {
            "key": "providence_college",
            "name": "Providence College",
            "role": "B.A., Political Science",
            "dates": "\u20132008",
            "note": "B.A. in Political Science, May 2008 \u2014 Providence, Rhode Island.",
        },
        {
            "key": "fordham_university",
            "name": "Fordham University",
            "role": "M.A., Elections and Campaign Management",
            "dates": "\u20132010",
            "note": "M.A. in Elections and Campaign Management, May 2010 \u2014 Bronx, New York.",
        },
    ],
}


def patch(path):
    p = Path(path)
    d = json.loads(p.read_text())
    n = 0
    for ind in d["individuals"]:
        if ind["id"] in AFFILIATIONS:
            ind["affiliations"] = AFFILIATIONS[ind["id"]]
            n += 1
    p.write_text(json.dumps(d, indent=2))
    return n


for proj in ["client/src/data.json"]:
    n = patch(proj)
    print(f"{proj}: patched {n}")
