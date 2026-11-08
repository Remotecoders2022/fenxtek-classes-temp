/* ============================================================
   Kruti Dev 010 -> Unicode Hindi converter (vendored, MIT).
   Source: @bharattype/hindi-transliteration (BharatType).
   Mirrors tools/typing-gen/oracle.mjs — regenerate both together.
   Runs live so the typing test accepts any Kruti Dev key sequence
   that produces the target Hindi text.
   ============================================================ */
export function krutiDevToUnicode(input) {
    if (!input)
        return "";
    /*
     * Kruti Dev 010 -> Unicode Hindi Converter
     *
     * IMPORTANT:
     * Mapping order matters.
     * Longer / special sequences must be converted
     * before shorter single-character sequences.
     *
     * Handles:
     * - Kruti Dev 010 character mappings
     * - Nukta characters
     * - Conjuncts
     * - Half consonants
     * - i-matra (f)
     * - i-matra + anusvara (fa)
     * - Reph marker (Z)
     * - Unicode normalization
     */
    const krutiChars = [
        "ñ",
        "Q+Z",
        "sas",
        "aa",
        ")Z",
        "ZZ",
        "‘",
        "’",
        "“",
        "”",
        "å",
        "ƒ",
        "„",
        "…",
        "†",
        "‡",
        "ˆ",
        "‰",
        "Š",
        "‹",
        "¶+",
        "d+",
        "[+k",
        "[+",
        "x+",
        "T+",
        "t+",
        "M+",
        "<+",
        "Q+",
        ";+",
        "j+",
        "u+",
        "Ùk",
        "Ù",
        "ä",
        "–",
        "—",
        "é",
        "™",
        "=kk",
        "f=k",
        "à",
        "á",
        "â",
        "ã",
        "ºz",
        "º",
        "í",
        "{k",
        "{",
        "=",
        "«",
        "Nî",
        "Vî",
        "Bî",
        "Mî",
        "<î",
        "|",
        "K",
        "}",
        "J",
        "Vª",
        "Mª",
        "<ªª",
        "Nª",
        "Ø",
        "Ý",
        "nzZ",
        "æ",
        "ç",
        "Á",
        "xz",
        "#",
        ":",
        "v‚",
        "vks",
        "vkS",
        "vk",
        "v",
        "b±",
        "Ã",
        "bZ",
        "b",
        "m",
        "Å",
        ",s",
        ",",
        "_",
        "ô",
        "d",
        "Dk",
        "D",
        "[k",
        "[",
        "x",
        "Xk",
        "X",
        "Ä",
        "?k",
        "?",
        "³",
        // FIXED:
        // pkS = चौ
        "pkS",
        "p",
        "Pk",
        "P",
        "N",
        "t",
        "Tk",
        "T",
        ">",
        "÷",
        "¥",
        "ê",
        "ë",
        "V",
        "B",
        "ì",
        "ï",
        "M+",
        "<+",
        "M",
        "<",
        ".k",
        ".",
        "r",
        "Rk",
        "R",
        "Fk",
        "F",
        ")",
        "n",
        "/k",
        "èk",
        "/",
        "Ë",
        "è",
        "u",
        "Uk",
        "U",
        "i",
        "Ik",
        "I",
        "Q",
        "¶",
        "c",
        "Ck",
        "C",
        "Hk",
        "H",
        "e",
        "Ek",
        "E",
        ";",
        "¸",
        "j",
        "y",
        "Yk",
        "Y",
        "G",
        "o",
        "Ok",
        "O",
        "'k",
        "'",
        '"k',
        '"',
        "l",
        "Lk",
        "L",
        "g",
        "È",
        "z",
        "Ì",
        "Í",
        "Î",
        "Ï",
        "Ñ",
        "Ò",
        "Ó",
        "Ô",
        "Ö",
        "Ø",
        "Ù",
        "Ük",
        "Ü",
        "‚",
        "ks",
        "kS",
        "k",
        "h",
        "q",
        "w",
        "`",
        "s",
        "S",
        "a",
        "¡",
        "%",
        "W",
        "•",
        "·",
        "∙",
        "~j",
        "~",
        "\\",
        "+",
        " ः",
        "^",
        "*",
        "Þ",
        "ß",
        "(",
        "¼",
        "½",
        "¿",
        "À",
        "¾",
        "A",
        "-",
        "&",
        "Œ",
        "]",
        "~ ",
        "@",
    ];
    const unicodeChars = [
        "॰",
        "QZ+",
        "sa",
        "a",
        "र्द्ध",
        "Z",
        '"',
        '"',
        "'",
        "'",
        "०",
        "१",
        "२",
        "३",
        "४",
        "५",
        "६",
        "७",
        "८",
        "९",
        "फ़्",
        "क़",
        "ख़",
        "ख़्",
        "ग़",
        "ज़्",
        "ज़",
        "ड़",
        "ढ़",
        "फ़",
        "य़",
        "ऱ",
        "ऩ",
        "त्त",
        "त्त्",
        "क्त",
        "दृ",
        "कृ",
        "न्न",
        "न्न्",
        "=k",
        "f=",
        "ह्न",
        "ह्य",
        "हृ",
        "ह्म",
        "ह्र",
        "ह्",
        "द्द",
        "क्ष",
        "क्ष्",
        "त्र",
        "त्र्",
        "छ्य",
        "ट्य",
        "ठ्य",
        "ड्य",
        "ढ्य",
        "द्य",
        "ज्ञ",
        "द्व",
        "श्र",
        "ट्र",
        "ड्र",
        "ढ्र",
        "छ्र",
        "क्र",
        "फ्र",
        "र्द्र",
        "द्र",
        "प्र",
        "प्र",
        "ग्र",
        "रु",
        "रू",
        "ऑ",
        "ओ",
        "औ",
        "आ",
        "अ",
        "ईं",
        "ई",
        "ई",
        "इ",
        "उ",
        "ऊ",
        "ऐ",
        "ए",
        "ऋ",
        "क्क",
        "क",
        "क",
        "क्",
        "ख",
        "ख्",
        "ग",
        "ग",
        "ग्",
        "घ",
        "घ",
        "घ्",
        "ङ",
        // FIXED:
        // Earlier: चै
        // Correct: चौ
        "चौ",
        "च",
        "च",
        "च्",
        "छ",
        "ज",
        "ज",
        "ज्",
        "झ",
        "झ्",
        "ञ",
        "ट्ट",
        "ट्ठ",
        "ट",
        "ठ",
        "ड्ड",
        "ड्ढ",
        "ड़",
        "ढ़",
        "ड",
        "ढ",
        "ण",
        "ण्",
        "त",
        "त",
        "त्",
        "थ",
        "थ्",
        "द्ध",
        "द",
        "ध",
        "ध",
        "ध्",
        "ध्",
        "ध्",
        "न",
        "न",
        "न्",
        "प",
        "प",
        "प्",
        "फ",
        "फ्",
        "ब",
        "ब",
        "ब्",
        "भ",
        "भ्",
        "म",
        "म",
        "म्",
        "य",
        "य्",
        "र",
        "ल",
        "ल",
        "ल्",
        "ळ",
        "व",
        "व",
        "व्",
        "श",
        "श्",
        "ष",
        "ष्",
        "स",
        "स",
        "स्",
        "ह",
        "ीं",
        "्र",
        "द्द",
        "ट्ट",
        "ट्ठ",
        "ड्ड",
        "कृ",
        "भ",
        "्य",
        "ड्ढ",
        "झ्",
        "क्र",
        "त्त्",
        "श",
        "श्",
        "ॉ",
        "ो",
        "ौ",
        "ा",
        "ी",
        "ु",
        "ू",
        "ृ",
        "े",
        "ै",
        "ं",
        "ँ",
        "ः",
        "ॅ",
        "ऽ",
        "ऽ",
        "ऽ",
        "्र",
        "्",
        "?",
        "़",
        ":",
        "‘",
        "’",
        "“",
        "”",
        ";",
        "(",
        ")",
        "{",
        "}",
        "=",
        "।",
        ".",
        "-",
        "॰",
        ",",
        "् ",
        "/",
    ];
    // Safety check: both mapping arrays must match.
    if (krutiChars.length !== unicodeChars.length) {
        console.error("Kruti Dev mapping error:", krutiChars.length, unicodeChars.length);
        return input;
    }
    let text = input;
    // --------------------------------------------------
    // STEP 1: Main ordered character conversion
    // --------------------------------------------------
    for (let i = 0; i < krutiChars.length; i++) {
        text = text.split(krutiChars[i]).join(unicodeChars[i]);
    }
    // --------------------------------------------------
    // STEP 2: Special Kruti Dev markers
    // --------------------------------------------------
    text = text.split("±").join("Zं");
    text = text.split("Æ").join("र्f");
    // --------------------------------------------------
    // STEP 3: Move short i-matra "f"
    // --------------------------------------------------
    let positionOfI = text.indexOf("f");
    while (positionOfI !== -1 && positionOfI + 1 < text.length) {
        const nextCharacter = text.charAt(positionOfI + 1);
        text =
            text.slice(0, positionOfI) +
                nextCharacter +
                "ि" +
                text.slice(positionOfI + 2);
        positionOfI = text.indexOf("f", positionOfI + 2);
    }
    // --------------------------------------------------
    // STEP 4: Handle i-matra + anusvara
    // --------------------------------------------------
    text = text.split("Ç").join("fa");
    text = text.split("É").join("र्fa");
    let positionOfFa = text.indexOf("fa");
    while (positionOfFa !== -1 && positionOfFa + 2 < text.length) {
        const nextCharacter = text.charAt(positionOfFa + 2);
        text =
            text.slice(0, positionOfFa) +
                nextCharacter +
                "िं" +
                text.slice(positionOfFa + 3);
        positionOfFa = text.indexOf("fa", positionOfFa + 2);
    }
    // --------------------------------------------------
    // STEP 5: Special long-i + Reph marker
    // --------------------------------------------------
    text = text.split("Ê").join("ीZ");
    // --------------------------------------------------
    // STEP 6: Fix i-matra before half consonants
    // --------------------------------------------------
    let wrongIPosition = text.indexOf("ि्");
    while (wrongIPosition !== -1 &&
        wrongIPosition + 2 < text.length) {
        const nextConsonant = text.charAt(wrongIPosition + 2);
        text =
            text.slice(0, wrongIPosition) +
                "्" +
                nextConsonant +
                "ि" +
                text.slice(wrongIPosition + 3);
        wrongIPosition = text.indexOf("ि्", wrongIPosition + 2);
    }
    // --------------------------------------------------
    // STEP 7: Handle Reph marker Z
    // --------------------------------------------------
    const matrasAndMarks = new Set([
        "ा",
        "ि",
        "ी",
        "ु",
        "ू",
        "ृ",
        "े",
        "ै",
        "ो",
        "ौ",
        "ं",
        "ः",
        "ँ",
        "ॅ",
        "़",
    ]);
    let positionOfR = text.indexOf("Z");
    while (positionOfR > 0) {
        let start = positionOfR - 1;
        // Move backwards over matras and marks.
        while (start > 0 &&
            matrasAndMarks.has(text.charAt(start))) {
            start--;
        }
        // Move backwards over conjunct clusters.
        while (start >= 2 && text.charAt(start - 1) === "्") {
            start -= 2;
        }
        const syllable = text.slice(start, positionOfR);
        text =
            text.slice(0, start) +
                "र्" +
                syllable +
                text.slice(positionOfR + 1);
        positionOfR = text.indexOf("Z");
    }
    // Remove unresolved Z markers.
    text = text.replace(/Z/g, "");
    // --------------------------------------------------
    // STEP 8: Cleanup
    // --------------------------------------------------
    // Remove zero-width characters.
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
    // Normalize Unicode.
    text = text.normalize("NFC");
    return text;
}
