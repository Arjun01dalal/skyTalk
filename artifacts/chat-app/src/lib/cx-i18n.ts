// Static translations for the customer onboarding / topic-picker UI.
// Languages are fixed (en/hi/kn/te/ta — see SUPPORTED_LANGUAGES), so these are
// hand-written dictionaries: instant, offline, and free. Dynamic content
// (category names from the DB) is translated server-side instead.

const STRINGS = {
  howCanWeHelp: {
    en: "Hi! How can we help you today?",
    hi: "नमस्ते! आज हम आपकी कैसे मदद कर सकते हैं?",
    kn: "ನಮಸ್ಕಾರ! ಇಂದು ನಾವು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
    te: "నమస్తే! ఈరోజు మేము మీకు ఎలా సహాయం చేయగలము?",
    ta: "வணக்கம்! இன்று நாங்கள் உங்களுக்கு எப்படி உதவலாம்?",
  },
  chooseTopic: {
    en: "Choose a topic and we'll help you right away.",
    hi: "एक विषय चुनें और हम तुरंत आपकी मदद करेंगे।",
    kn: "ಒಂದು ವಿಷಯವನ್ನು ಆರಿಸಿ, ನಾವು ತಕ್ಷಣ ನಿಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇವೆ.",
    te: "ఒక అంశాన్ని ఎంచుకోండి, మేము వెంటనే మీకు సహాయం చేస్తాము.",
    ta: "ஒரு தலைப்பைத் தேர்ந்தெடுங்கள், நாங்கள் உடனே உதவுகிறோம்.",
  },
  selectOptionUnder: {
    en: "Select an option under",
    hi: "इसके अंतर्गत एक विकल्प चुनें:",
    kn: "ಇದರ ಅಡಿಯಲ್ಲಿ ಒಂದು ಆಯ್ಕೆಯನ್ನು ಆರಿಸಿ:",
    te: "దీని కింద ఒక ఎంపికను ఎంచుకోండి:",
    ta: "இதன் கீழ் ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்:",
  },
  back: {
    en: "Back",
    hi: "वापस",
    kn: "ಹಿಂದೆ",
    te: "వెనుకకు",
    ta: "பின்செல்",
  },
  other: {
    en: "Other",
    hi: "अन्य",
    kn: "ಇತರೆ",
    te: "ఇతరం",
    ta: "மற்றவை",
  },
  describeIssueOwnWords: {
    en: "Describe your issue in your own words",
    hi: "अपनी समस्या अपने शब्दों में बताएं",
    kn: "ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ನಿಮ್ಮ ಮಾತಿನಲ್ಲಿ ವಿವರಿಸಿ",
    te: "మీ సమస్యను మీ మాటల్లో వివరించండి",
    ta: "உங்கள் பிரச்சனையை உங்கள் வார்த்தைகளில் விவரிக்கவும்",
  },
  describeIssuePlaceholder: {
    en: "Describe your issue...",
    hi: "अपनी समस्या लिखें...",
    kn: "ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ಬರೆಯಿರಿ...",
    te: "మీ సమస్యను రాయండి...",
    ta: "உங்கள் பிரச்சனையை எழுதுங்கள்...",
  },
  typeDetailsPlaceholder: {
    en: "Type your details here...",
    hi: "अपना विवरण यहाँ लिखें...",
    kn: "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ...",
    te: "మీ వివరాలను ఇక్కడ రాయండి...",
    ta: "உங்கள் விவரங்களை இங்கே எழுதுங்கள்...",
  },
  shareDetails: {
    en: "Please share the details so we can help you faster.",
    hi: "कृपया विवरण साझा करें ताकि हम आपकी जल्दी मदद कर सकें।",
    kn: "ದಯವಿಟ್ಟು ವಿವರಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ, ನಾವು ವೇಗವಾಗಿ ಸಹಾಯ ಮಾಡಬಹುದು.",
    te: "దయచేసి వివరాలను తెలియజేయండి, మేము త్వరగా సహాయం చేయగలము.",
    ta: "விவரங்களைப் பகிரவும், நாங்கள் விரைவாக உதவ முடியும்.",
  },
  submit: {
    en: "Submit",
    hi: "जमा करें",
    kn: "ಸಲ್ಲಿಸಿ",
    te: "సమర్పించండి",
    ta: "சமர்ப்பிக்கவும்",
  },
  startChat: {
    en: "Start chat",
    hi: "चैट शुरू करें",
    kn: "ಚಾಟ್ ಪ್ರಾರಂಭಿಸಿ",
    te: "చాట్ ప్రారంభించండి",
    ta: "அரட்டையைத் தொடங்கு",
  },
  selectDeposit: {
    en: "Select the deposit you need help with",
    hi: "वह डिपॉज़िट चुनें जिसमें आपको मदद चाहिए",
    kn: "ನಿಮಗೆ ಸಹಾಯ ಬೇಕಾದ ಠೇವಣಿ ಆರಿಸಿ",
    te: "మీకు సహాయం కావాల్సిన డిపాజిట్‌ను ఎంచుకోండి",
    ta: "உதவி தேவைப்படும் டெபாசிட்டைத் தேர்ந்தெடுக்கவும்",
  },
  selectWithdrawal: {
    en: "Select a pending withdrawal",
    hi: "एक लंबित निकासी चुनें",
    kn: "ಬಾಕಿ ಇರುವ ಹಿಂಪಡೆಯುವಿಕೆ ಆರಿಸಿ",
    te: "పెండింగ్ విత్‌డ్రాయల్‌ను ఎంచుకోండి",
    ta: "நிலுவையில் உள்ள திரும்பப்பெறுதலைத் தேர்ந்தெடுக்கவும்",
  },
  selectBet: {
    en: "Select the bet you need help with",
    hi: "वह बेट चुनें जिसमें आपको मदद चाहिए",
    kn: "ನಿಮಗೆ ಸಹಾಯ ಬೇಕಾದ ಬೆಟ್ ಆರಿಸಿ",
    te: "మీకు సహాయం కావాల్సిన బెట్‌ను ఎంచుకోండి",
    ta: "உதவி தேவைப்படும் பெட்டைத் தேர்ந்தெடுக்கவும்",
  },
  selectedTransaction: {
    en: "Selected Transaction",
    hi: "चुना गया लेन-देन",
    kn: "ಆಯ್ದ ವಹಿವಾಟು",
    te: "ఎంచుకున్న లావాదేవీ",
    ta: "தேர்ந்தெடுக்கப்பட்ட பரிவர்த்தனை",
  },
  selectedBet: {
    en: "Selected Bet",
    hi: "चुनी गई बेट",
    kn: "ಆಯ್ದ ಬೆಟ್",
    te: "ఎంచుకున్న బెట్",
    ta: "தேர்ந்தெடுக்கப்பட்ட பெட்",
  },
  whatIssue: {
    en: "What seems to be the issue?",
    hi: "क्या समस्या है?",
    kn: "ಸಮಸ್ಯೆ ಏನು?",
    te: "సమస్య ఏమిటి?",
    ta: "என்ன பிரச்சனை?",
  },
  chooseDifferentTxn: {
    en: "Choose a different transaction",
    hi: "दूसरा लेन-देन चुनें",
    kn: "ಬೇರೆ ವಹಿವಾಟು ಆರಿಸಿ",
    te: "వేరే లావాదేవీని ఎంచుకోండి",
    ta: "வேறு பரிவர்த்தனையைத் தேர்ந்தெடுக்கவும்",
  },
  chooseDifferentBet: {
    en: "Choose a different bet",
    hi: "दूसरी बेट चुनें",
    kn: "ಬೇರೆ ಬೆಟ್ ಆರಿಸಿ",
    te: "వేరే బెట్‌ను ఎంచుకోండి",
    ta: "வேறு பெட்டைத் தேர்ந்தெடுக்கவும்",
  },
  getHelpWithBet: {
    en: "Get help with this bet",
    hi: "इस बेट में मदद लें",
    kn: "ಈ ಬೆಟ್‌ಗೆ ಸಹಾಯ ಪಡೆಯಿರಿ",
    te: "ఈ బెట్‌కు సహాయం పొందండి",
    ta: "இந்த பெட்டுக்கு உதவி பெறுங்கள்",
  },
  searchBetHistory: {
    en: "Search your bet history",
    hi: "अपना बेट इतिहास खोजें",
    kn: "ನಿಮ್ಮ ಬೆಟ್ ಇತಿಹಾಸ ಹುಡುಕಿ",
    te: "మీ బెట్ చరిత్రను వెతకండి",
    ta: "உங்கள் பெட் வரலாற்றைத் தேடுங்கள்",
  },
  startDate: {
    en: "Start date",
    hi: "आरंभ तिथि",
    kn: "ಪ್ರಾರಂಭ ದಿನಾಂಕ",
    te: "ప్రారంభ తేదీ",
    ta: "தொடக்க தேதி",
  },
  endDate: {
    en: "End date",
    hi: "अंतिम तिथि",
    kn: "ಅಂತಿಮ ದಿನಾಂಕ",
    te: "ముగింపు తేదీ",
    ta: "இறுதி தேதி",
  },
  gameType: {
    en: "Game type",
    hi: "गेम का प्रकार",
    kn: "ಆಟದ ಪ್ರಕಾರ",
    te: "గేమ్ రకం",
    ta: "விளையாட்டு வகை",
  },
  allGameTypes: {
    en: "All game types",
    hi: "सभी गेम प्रकार",
    kn: "ಎಲ್ಲಾ ಆಟದ ಪ್ರಕಾರಗಳು",
    te: "అన్ని గేమ్ రకాలు",
    ta: "அனைத்து விளையாட்டு வகைகள்",
  },
  status: {
    en: "Status",
    hi: "स्थिति",
    kn: "ಸ್ಥಿತಿ",
    te: "స్థితి",
    ta: "நிலை",
  },
  all: {
    en: "All",
    hi: "सभी",
    kn: "ಎಲ್ಲಾ",
    te: "అన్నీ",
    ta: "அனைத்தும்",
  },
  findBets: {
    en: "Find Bets",
    hi: "बेट खोजें",
    kn: "ಬೆಟ್ ಹುಡುಕಿ",
    te: "బెట్‌లను వెతకండి",
    ta: "பெட்களைத் தேடு",
  },
  filters: {
    en: "Filters",
    hi: "फ़िल्टर",
    kn: "ಫಿಲ್ಟರ್",
    te: "ఫిల్టర్లు",
    ta: "வடிப்பான்கள்",
  },
  loadingRecords: {
    en: "Loading your records...",
    hi: "आपके रिकॉर्ड लोड हो रहे हैं...",
    kn: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...",
    te: "మీ రికార్డులు లోడ్ అవుతున్నాయి...",
    ta: "உங்கள் பதிவுகள் ஏற்றப்படுகின்றன...",
  },
  errorLoading: {
    en: "Error loading records",
    hi: "रिकॉर्ड लोड करने में त्रुटि",
    kn: "ದಾಖಲೆಗಳನ್ನು ಲೋಡ್ ಮಾಡುವಲ್ಲಿ ದೋಷ",
    te: "రికార్డులను లోడ్ చేయడంలో లోపం",
    ta: "பதிவுகளை ஏற்றுவதில் பிழை",
  },
  checkConnection: {
    en: "Please check your connection and try again.",
    hi: "कृपया अपना कनेक्शन जांचें और फिर से कोशिश करें।",
    kn: "ದಯವಿಟ್ಟು ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    te: "దయచేసి మీ కనెక్షన్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.",
    ta: "இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
  },
  noRecords: {
    en: "No records found for this period.",
    hi: "इस अवधि के लिए कोई रिकॉर्ड नहीं मिला।",
    kn: "ಈ ಅವಧಿಗೆ ಯಾವುದೇ ದಾಖಲೆ ಸಿಗಲಿಲ್ಲ.",
    te: "ఈ కాలానికి రికార్డులు కనబడలేదు.",
    ta: "இந்த காலத்திற்கு பதிவுகள் இல்லை.",
  },
  changeLanguage: {
    en: "Change language",
    hi: "भाषा बदलें",
    kn: "ಭಾಷೆ ಬದಲಿಸಿ",
    te: "భాషను మార్చండి",
    ta: "மொழியை மாற்று",
  },
  languageChanged: {
    en: "Language updated. New messages will arrive in your selected language.",
    hi: "भाषा बदल दी गई है। नए संदेश आपकी चुनी हुई भाषा में आएंगे।",
    kn: "ಭಾಷೆ ಬದಲಾಯಿಸಲಾಗಿದೆ. ಹೊಸ ಸಂದೇಶಗಳು ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಬರುತ್ತವೆ.",
    te: "భాష మార్చబడింది. కొత్త సందేశాలు మీ భాషలో వస్తాయి.",
    ta: "மொழி மாற்றப்பட்டது. புதிய செய்திகள் உங்கள் மொழியில் வரும்.",
  },
} as const;

// Per-language issue-option defaults (used when no DB subcategories exist).
export const CX_ISSUE_DEFAULTS_I18N: Record<string, Record<string, string[]>> = {
  en: {
    deposit: ["Money debited", "Money not credited", "Payment not added", "Other"],
    withdrawal: ["Check status", "Payment not received", "Withdrawal delayed", "Other"],
  },
  hi: {
    deposit: ["पैसे कट गए", "पैसे जमा नहीं हुए", "भुगतान नहीं जुड़ा", "अन्य"],
    withdrawal: ["स्थिति जांचें", "भुगतान नहीं मिला", "निकासी में देरी", "अन्य"],
  },
  kn: {
    deposit: ["ಹಣ ಕಡಿತವಾಗಿದೆ", "ಹಣ ಜಮೆಯಾಗಿಲ್ಲ", "ಪಾವತಿ ಸೇರಿಸಿಲ್ಲ", "ಇತರೆ"],
    withdrawal: ["ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಿ", "ಪಾವತಿ ಬಂದಿಲ್ಲ", "ಹಿಂಪಡೆಯುವಿಕೆ ವಿಳಂಬ", "ಇತರೆ"],
  },
  te: {
    deposit: ["డబ్బు డెబిట్ అయింది", "డబ్బు జమ కాలేదు", "చెల్లింపు జోడించలేదు", "ఇతరం"],
    withdrawal: ["స్థితిని తనిఖీ చేయండి", "చెల్లింపు అందలేదు", "విత్‌డ్రాయల్ ఆలస్యం", "ఇతరం"],
  },
  ta: {
    deposit: ["பணம் பிடித்தம் ஆனது", "பணம் வரவு வைக்கப்படவில்லை", "கட்டணம் சேர்க்கப்படவில்லை", "மற்றவை"],
    withdrawal: ["நிலையைச் சரிபார்க்கவும்", "பணம் வரவில்லை", "திரும்பப்பெறுதல் தாமதம்", "மற்றவை"],
  },
};

export type CxStringKey = keyof typeof STRINGS;

/** Translate a customer-UI string into the given language (falls back to English). */
export function cxT(lang: string | null | undefined, key: CxStringKey): string {
  const entry = STRINGS[key] as Record<string, string>;
  return entry[lang ?? "en"] ?? entry.en;
}
