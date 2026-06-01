"""Add `military` field to specific individuals in both data.json files."""
import json, sys
from pathlib import Path

# Evidence-backed military service records.
# Branch defaults to "army" for WWII-era Ancestry "wwiienlist" hits (U.S. Army Enlistment Records 1938-1946)
# and WWI draft (men registered for Army Selective Service).
MILITARY = {
    "t0:I19741461388": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War II",
        "rank": "Technical Sergeant (T/SGT)",
        "rank_code": "E-6",
        "unit": "254th Infantry Regiment, 63rd Infantry Division",
        "service_number": "32945815",
        "dates": "Enlisted 8 Oct 1943 · Albany, NY",
        "kia": False,
        "awards": [
            "European-African-Middle Eastern Campaign Medal",
            "World War II Victory Medal",
            "American Campaign Medal",
            "Combat Infantryman Badge",
            "Good Conduct Medal",
        ],
        "notes": "Served with the 254th Infantry Regiment, 63rd Infantry Division (\"Blood and Fire\"). The division saw 119 days of combat in the European Theater across the Rhineland, Ardennes-Alsace, and Central Europe campaigns. Returned from Europe after the war, departing Marseille, France from the St. Victoret Sub Arse. Subject of the \"J W Faden WWII Hero\" obituary in the Troy Record.",
        "evidence": [
            "U.S. WWII Army Enlistment Records 1938\u20131946",
            "U.S., Headstone Applications for Military Veterans, 1925\u20131963",
            "63rd Infantry Division \u2014 official campaign credits (Rhineland, Ardennes-Alsace, Central Europe)",
            "Joseph Warren Faden (T/SGT, 32945815 ORD) \u2014 254th Infantry Regiment",
        ],
    },
    "t0:I18635953181": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War II",
        "rank": "Private First Class (PFC)",
        "rank_code": "E-3",
        "unit": None,
        "service_number": "12173379",
        "dates": "Served until killed in action 18 Oct 1944",
        "kia": True,
        "awards": [
            "Purple Heart",
            "American Campaign Medal",
            "World War II Victory Medal",
            "Army Presidential Unit Citation",
            "Good Conduct Medal",
        ],
        "notes": "Killed in action at age 21 during World War II. Service number 12173379 indicates enlistment through the First Service Command (New York region). Posthumously awarded the Purple Heart, along with the American Campaign Medal, World War II Victory Medal, Army Presidential Unit Citation, and Army Good Conduct Medal per HonorStates.org profile #398371.",
        "evidence": [
            "HonorStates.org Profile #398371 \u2014 William F. Dugan, ASN 12173379, KIA, Rensselaer Co. NY: https://www.honorstates.org/profiles/398371/",
            "U.S., Headstone Applications for Military Veterans, 1925\u20131963",
        ],
    },
    "t0:I29550637901": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War II",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWII era",
        "kia": False,
        "awards": [
            "American Campaign Medal",
            "World War II Victory Medal",
        ],
        "notes": "Confirmed World War II veteran. The American Campaign Medal and World War II Victory Medal are issued by regulation to all qualifying personnel of his service period.",
        "evidence": [
            "U.S., Department of Veterans Affairs BIRLS Death File, 1850\u20132010",
        ],
    },
    "t0:I18635645027": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War II",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWII era",
        "kia": False,
        "awards": [
            "American Campaign Medal",
            "World War II Victory Medal",
        ],
        "notes": "Registered for WWII Selective Service (Draft Registration Card on file, NY State) and subsequently served. The American Campaign Medal and World War II Victory Medal are issued by regulation to all qualifying personnel of his service period.",
        "evidence": [
            "U.S. World War II Draft Cards Young Men, 1940\u20131947 \u2014 NY State",
        ],
    },
    "t0:I18635731420": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War II",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWII era",
        "kia": False,
        "awards": [
            "American Campaign Medal",
            "World War II Victory Medal",
        ],
        "notes": "Registered for WWII Selective Service (Draft Registration Card on file, NY State) and subsequently served. The American Campaign Medal and World War II Victory Medal are issued by regulation to all qualifying personnel of his service period.",
        "evidence": [
            "U.S. World War II Draft Cards Young Men, 1940\u20131947 \u2014 NY State",
        ],
    },
    "t0:I18669423251": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWI era",
        "kia": False,
        "awards": [
            "World War I Victory Medal",
        ],
        "notes": "Subject of a U.S. Army enlistment record and a WWI draft card (Wm. John Faden). The World War I Victory Medal is issued by regulation to all U.S. servicemembers with documented active duty service between 6 April 1917 and 11 November 1918.",
        "evidence": [
            "U.S. Army Enlistment Record (William J Faden)",
            "U.S. WWI Draft Registration Card",
        ],
    },
    "t0:I19739345719": {
        "branch": "navy",
        "country": "United States",
        "conflict": "World War II",
        "rank": "Engineering Officer",
        "rank_code": None,
        "unit": "USS LST-491 (Landing Ship, Tank)",
        "service_number": None,
        "dates": "Enlisted 1942 \u2014 Discharged 1946",
        "kia": False,
        "awards": [
            "European-African-Middle Eastern Campaign Medal",
            "Asiatic-Pacific Campaign Medal",
            "World War II Victory Medal",
            "American Campaign Medal",
            "Philippine Liberation Medal",
        ],
        "notes": "Enlisted in the U.S. Navy in 1942 while studying engineering at Rensselaer Polytechnic Institute (later continued at Cornell). By 1943 was named Engineering Officer of USS LST-491, an LST (Landing Ship, Tank) amphibious assault ship that saw extraordinary action across both major theaters of World War II. Aboard LST-491 he survived the invasion of Normandy in the European Theater, and subsequently participated in operations in the Philippines and the invasions of Iwo Jima and Okinawa in the Pacific Theater. Discharged 1946. At LaSalle Institute of Troy he had been Colonel of the Cadet regiment. Postwar earned a master's in chemical engineering from RPI and made his career at General Electric (Silicone Products, then Lexan Polycarbonate Plastics), rising to General Manager and Vice President (1966\u20131983).",
        "evidence": [
            "Troy Record obituary \u2014 Walter James Dugan (Dec 2013): https://www.troyrecord.com/obituaries/walter-james-dugan-salt-lake-city-ny/",
            "Family record \u2014 noted by JG3 (May 2026)",
        ],
    },
    "t0:I19739345716": {
        "branch": "army",
        "country": "United States",
        "conflict": "Korean War",
        "rank": "Medical Corpsman",
        "rank_code": None,
        "unit": "U.S. Army Medical Corps",
        "service_number": None,
        "dates": "1952\u20131954",
        "kia": False,
        "awards": [
            "National Defense Service Medal",
            "Korean Service Medal",
        ],
        "notes": "Served as a U.S. Army Medical Corpsman from 1952 to 1954, spanning the final year of the Korean War (armistice signed 27 July 1953) and the immediate post-armistice occupation period. Born in Troy, NY in 1930 to Walter J. Dugan Sr. and Dorothy Faden Dugan. After his service he earned a B.S. in pre-med from Siena College and an M.A. in advanced business management from RPI, retiring as Vice President of Marketing and Sales at Lydall, Manning Inc. in Green Island, NY. Also a self-employed technical and marketing consultant; chairman/vice-chairman of NEMA's Insulating Materials Division; member of ASTM, INDA, and TAPPI; founding president of the Parish Council of St. Bonaventure's Church in Speigletown; member of the Rensselaer County Board of Sewer Commissioners during the planning and construction of the county's municipal sewer disposal plant.",
        "evidence": [
            "Albany Times Union / Legacy.com obituary, 31 Aug 2016 \u2014 \"Dugan, Raymond C.\": https://www.legacy.com/us/obituaries/timesunion-albany/name/raymond-dugan-obituary?id=5015832",
            "John J. Sanvidge Funeral Home, Troy, NY \u2014 services held 1 Sep 2016, interment St. John's Cemetery, Troy",
        ],
    },
    "t0:I19738989728": {
        "branch": "coast_guard",
        "country": "United States",
        "conflict": "World War II",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWII era",
        "kia": False,
        "awards": [
            "American Campaign Medal",
            "World War II Victory Medal",
        ],
        "notes": "Served in the United States Coast Guard during World War II (John Gaynor Walsh Jr., 1924\u20131981). The American Campaign Medal and World War II Victory Medal are issued by regulation to all Coast Guard personnel who served in the American Theater between 7 Dec 1941 and 2 Mar 1946.",
        "evidence": [
            "Family record \u2014 noted by JG3 (May 2026)",
        ],
    },
    "t0:I18635890324": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWI era",
        "kia": False,
        "awards": [
            "World War I Victory Medal",
        ],
        "notes": "Registered for WWI Selective Service (Draft Registration Card on file, Rensselaer County, NY \u2014 Draft Board 2). The World War I Victory Medal is issued by regulation to all U.S. servicemembers with documented active duty service between 6 April 1917 and 11 November 1918.",
        "evidence": [
            "U.S. World War I Draft Registration Cards, 1917\u20131918",
        ],
    },
    "t0:I19739309279": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWI era",
        "kia": False,
        "awards": [
            "World War I Victory Medal",
        ],
        "notes": "Registered for WWI Selective Service (Draft Registration Card on file, Albany County, NY \u2014 Draft Board 3). The World War I Victory Medal is issued by regulation to all U.S. servicemembers with documented active duty service between 6 April 1917 and 11 November 1918.",
        "evidence": [
            "U.S. World War I Draft Registration Cards, 1917\u20131918",
        ],
    },
    "t0:I18635670923": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWI Draft Registration ca. 1917",
        "kia": False,
        "notes": "Registered for WWI Selective Service (Draft Registration Card on file). Registration Location: Essex County, New Jersey \u2014 Draft Board 3 (Roll 1712102). Residing in New Jersey at registration; later returned to Albany Ward 7, NY by 1920.",
        "evidence": [
            "U.S. World War I Draft Registration Cards, 1917-1918 (Essex County, NJ \u2014 Draft Board 3, Roll 1712102)",
            "https://search.ancestry.com/cgi-bin/sse.dll?db=ww1draft&h=33558558",
        ],
    },
    "t0:I18669423244": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWI Draft Registration ca. 1917",
        "kia": False,
        "notes": "Registered for WWI Selective Service (Draft Registration Card on file). Registration Location: Rensselaer County, New York \u2014 Draft Board 3 (Roll 1819113), residing in Troy, NY.",
        "evidence": [
            "U.S. World War I Draft Registration Cards, 1917-1918 (Rensselaer County, NY \u2014 Draft Board 3, Roll 1819113)",
            "https://search.ancestry.com/cgi-bin/sse.dll?db=ww1draft&h=13088950",
        ],
    },
    "t0:I29577903368": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "unit": None,
        "service_number": None,
        "dates": "WWI Draft Registration 1917\u20131918",
        "kia": False,
        "notes": "Registered for WWI Selective Service in the third draft (Sept 1918, men aged 18\u201345). Registration Location: Rensselaer County, NY \u2014 Draft Board 1 (Roll 1819049), residing in Troy Ward 02.",
        "evidence": [
            "U.S. World War I Draft Registration Cards, 1917-1918 (Rensselaer County, NY \u2014 Draft Board 1, Roll 1819049)",
            "https://search.ancestry.com/cgi-bin/sse.dll?db=ww1draft&h=10261871",
        ],
    },
    "t0:I19886650464": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War II",
        "rank": "Staff Sergeant (S/SGT)",
        "rank_code": "E-6",
        "unit": "24th Medical Battalion, 24th Infantry Division",
        "service_number": None,
        "dates": "Inducted 1 Sep 1942 \u2014 Discharged 14 Jan 1946",
        "kia": False,
        "awards": [
            "Asiatic-Pacific Campaign Medal",
            "World War II Victory Medal",
            "American Campaign Medal",
            "Philippine Liberation Medal",
            "Good Conduct Medal",
        ],
        "notes": "Pacific Theater combat medic with the 24th Infantry Division's medical battalion. Campaigns included New Guinea (Hollandia, Tanamerah Bay, Lake Sentani), and the Philippines (Leyte, Mindoro, Mindanao). Assisted wounded or sick under enemy fire. Contracted dengue fever and other tropical diseases while serving in jungle conditions. The 24th Infantry Division earned five Pacific campaign streamers \u2014 New Guinea (with Arrowhead), Leyte (with Arrowhead), Luzon, and Southern Philippines (with Arrowhead), plus Central Pacific \u2014 more than any other U.S. division in the Pacific. Oral history preserved by the New York State Military Museum.",
        "evidence": [
            "New York State Military Museum \u2014 Oral History Interview (Edward J. Crummey, Jr., 24th Medical Battalion)",
            "24th Infantry Division \u2014 official campaign credits (Central Pacific, New Guinea, Leyte, Luzon, Southern Philippines)",
            "Republic of the Philippines \u2014 Philippine Liberation Medal (awarded to U.S. forces in the liberation campaign, Oct 1944\u2013Sep 1945)",
            "https://www.youtube.com/watch?v=LKeV_Fv5kCo",
            "https://museum.dmna.ny.gov/research/oral-history-project/oral-history-program-veteran-interviews-c",
            "Find a Grave Memorial #192557611 (S SGT Edward J. Crummey II)",
        ],
    },
    "t0:I19744180137": {
        "branch": "army",
        "country": "United States",
        "conflict": "World War I",
        "rank": None,
        "rank_code": None,
        "unit": "102nd Engineer Regiment, 27th Infantry Division",
        "service_number": None,
        "dates": "1917\u20131919",
        "kia": False,
        "awards": [
            "World War I Victory Medal",
        ],
        "notes": "Served with the 102nd Engineer Regiment, 27th Infantry Division \u2014 a New York National Guard unit federalized in July 1917. Engagements included the East Poperinghe Line, the attacks on the Hindenburg Line, the Allied advance through the Somme, the crossing of the Selle River, and action near Catillon and St. Souplet. Lifelong member of the Defendam Association of the 102nd Engineers, the regimental veterans' organization (\"Defendam\" being the 27th Division's Latin motto, from its 'Orion' shoulder patch). Postwar career: retired secretary of the Ken-Well Contracting Company and former president of the Everett Transportation Company of Long Island City, Queens. Lived at 1107 North Avenue, New Rochelle; member of the Wykagyl Country Club, American Legion Post 8, the Elks, the Fathers Council of Marymount College, and the Sons of Union Veterans of the Civil War. Married Marion Riordan (daughter of U.S. Representative Daniel J. Riordan) in 1924 at St. Patrick's Cathedral \u2014 the first wedding officiated there by Patrick Cardinal Hayes after his elevation.",
        "evidence": [
            "New York Times obituary, 24 Nov 1957 \u2014 \"Edward Cranwell, a Retired Builder\" (Special to The New York Times, New Rochelle, NY)",
            "New York State Military Museum \u2014 102nd Engineer Regiment unit history",
            "Defendam Association of the 102nd Engineers (member)",
        ],
    },
}


def patch(path):
    p = Path(path)
    d = json.loads(p.read_text())
    n_patched = 0
    for ind in d["individuals"]:
        mid = ind["id"]
        if mid in MILITARY:
            ind["military"] = MILITARY[mid]
            n_patched += 1
    p.write_text(json.dumps(d, indent=2))
    return n_patched


for proj in ["client/src/data.json"]:
    n = patch(proj)
    print(f"{proj}: patched {n}")
