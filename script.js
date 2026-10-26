const translations = {
  en: {
    skip:"Skip to content", navSpace:"The space", navWorkshops:"Workshops", navRates:"Rates", navBook:"Check availability", eyebrow:"A PLACE TO SHARE", heroTitle:"Celebrate, play<br>and create <em>at Caleta.</em>", heroText:"A welcoming place for birthdays, get-togethers and creative workshops. Come and enjoy it your way.", heroCta:"Find your date", heroLink:"Meet Caleta", heroNote:"In Nou Nazareth, San Juan de Alicante", artCaption:"A CORNER MADE FOR CREATIVITY", heroBottom:"ONE PLACE, MANY WAYS TO ENJOY IT",
    introKicker:"THE SPACE", introTitle:"Good moments need<br>room to <em>happen.</em>", introText:"Caleta is a versatile, welcoming space to get together, celebrate and let your imagination run free. You bring the occasion; we provide a special place to enjoy it.", featureCelebrate:"Celebrate", featureCelebrateText:"Birthdays and moments to remember, in a space just for you.", featureCreate:"Create", featureCreateText:"Workshops to explore, experiment and get a little messy.", featurePlay:"Play", featurePlayText:"A corner where play and imagination go hand in hand.", featureLink:"Explore Caleta",
    workshopKicker:"WORKSHOPS & ACTIVITIES", workshopTitle:"Curious hands,<br><em>big ideas.</em>", workshopText:"Every workshop is an invitation to try something new. Upcoming dates and available places will be posted here.", ageLabel:"AGES 2–3", durationOne:"1 HOUR", sensoryTitle:"Little sensory lab", sensoryText:"Textures, colours and discoveries at their own pace.", ageLabelTwo:"AGES 3–8", colorTitle:"Colour and creativity workshop", colorText:"Paint, experiment and take home something you made.", ageLabelThree:"ALL AGES", flexTime:"FLEXIBLE TIMES", freeTitle:"A little free play", freeText:"Time to share, play and discover at your own pace.", workshopRequest:"Ask about upcoming dates", workshopNote:"Illustrative images. The programme may change; please check the activity and its places before booking.",
    ratesKicker:"SPACE HIRE", ratesTitle:"A space to make<br>your own.", ratesText:"Choose a time that works for you. Ask us about other options.", morning:"Mornings", afternoons:"Afternoons", fullDay:"Full day", monThu:"Monday to Thursday", friday:"Friday", weekendFestive:"Saturday, Sunday and public holidays", friSun:"Friday, Saturday and Sunday", holidayEve:"Public holidays and their eves", weekend:"Saturday and Sunday", ratesNote:"Other times and public holidays: please enquire. Morning rates may vary during school holidays. Indicative rates, subject to review by Caleta.", ratesCta:"Ask about a date",
    bookingKicker:"LET'S START WITH A DATE", bookingTitle:"Shall we make it<br><em>special?</em>", bookingText:"Tell us what you have in mind. Caleta will review your request and get back to you to confirm availability, price and deposit.", stepOne:"Send us an enquiry", stepTwo:"Caleta reviews and replies", stepThree:"If accepted, you have 24 hours to pay the deposit", formEyebrow:"BOOKING ENQUIRY", typeLabel:"What would you like to book?", typePlaceholder:"Choose an option", spaceOption:"The space", workshopOption:"A workshop or activity", dateLabel:"Date you have in mind", timeLabel:"Approximate time", timePlaceholder:"Choose", morningOption:"Morning · 09:30–14:00", afternoonOption:"Afternoon · 16:00–21:30", fullOption:"Full day · 09:30–21:30", otherOption:"Another time", placesLabel:"Number of places", nameLabel:"Your name", phoneLabel:"Phone", emailLabel:"Email address", notesLabel:"Anything else we should know?", optional:"Optional", consentText:'I agree that Caleta may use my details to reply to this enquiry. See the <a href="#privacidad">privacy notice</a>.', submitText:"Send enquiry", formNote:"This demo does not send or save your details. The live calendar and payments will be connected in the next phase.", namePlaceholder:"First and last name", phonePlaceholder:"600 000 000", notesPlaceholder:"Tell us a little more…", contactInvite:"A place to come, share and return.", privacyNote:"The full privacy notice will be published before enquiry submissions are enabled. This form is a demo only and does not send or save data."
  }
};

let language = "es";
const languageButton = document.querySelector(".language-toggle");
const html = document.documentElement;

languageButton.addEventListener("click", () => {
  language = language === "es" ? "en" : "es";
  html.lang = language;
  languageButton.textContent = language === "es" ? "EN" : "ES";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = translations[language]?.[node.dataset.i18n];
    if (value) node.innerHTML = value;
  });
  document.querySelectorAll("[data-placeholder]").forEach((node) => {
    const value = translations[language]?.[node.dataset.placeholder];
    if (value) node.placeholder = value;
  });
});

const menuButton = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
menuButton.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  mainNav.classList.toggle("open", !expanded);
  menuButton.setAttribute("aria-label", expanded ? "Abrir menú" : "Cerrar menú");
});
mainNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  mainNav.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}));

const bookingType = document.querySelector("#booking-type");
const placesField = document.querySelector(".places-field");
const placesInput = placesField.querySelector("input");
bookingType.addEventListener("change", () => {
  const workshop = bookingType.value === "workshop";
  placesField.classList.toggle("is-hidden", !workshop);
  placesInput.required = workshop;
});
document.querySelectorAll("[data-workshop]").forEach((link) => link.addEventListener("click", () => {
  bookingType.value = "workshop";
  bookingType.dispatchEvent(new Event("change"));
}));

const dateInput = document.querySelector('input[name="date"]');
const today = new Date();
dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
document.querySelector("#year").textContent = new Date().getFullYear();

const form = document.querySelector("#booking-form");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = language === "es"
    ? "La web aún está en preparación. Esta solicitud no se ha enviado."
    : "The website is still being prepared. This enquiry has not been sent.";
  document.querySelector("#form-response").textContent = message;
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 3800);
});
