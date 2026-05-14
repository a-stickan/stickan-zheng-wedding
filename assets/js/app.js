const config = window.WEDDING_CONFIG || {};
const isConfigured = config.rsvpApiUrl && !config.rsvpApiUrl.includes("YOUR_RSVP_API_URL");

const form = document.querySelector("#rsvp-form");
const alertBox = document.querySelector("#form-alert");
const lookupButton = document.querySelector("#lookup-button");
const submitButton = document.querySelector("#submit-button");
const inviteCodeInput = document.querySelector("#invite-code");
const guestDetails = document.querySelector("#guest-details");
const groupName = document.querySelector("#group-name");
const groupSummary = document.querySelector("#group-summary");
const memberFields = document.querySelector("#member-fields");
const turnstileWidget = document.querySelector("#turnstile-widget");

let currentGroup = null;
let turnstileWidgetId = null;
let turnstileToken = "";

function setAlert(message, type = "info") {
  const styles = {
    info: "border-sage/50 bg-linen text-ink",
    success: "border-moss/40 bg-[#eef4ee] text-moss",
    error: "border-petal/40 bg-[#fff0ee] text-[#8f453f]",
  };

  alertBox.className = `mb-5 rounded-md border px-4 py-3 text-sm ${styles[type]}`;
  alertBox.textContent = message;
  alertBox.classList.remove("hidden");
}

function clearAlert() {
  alertBox.classList.add("hidden");
  alertBox.textContent = "";
}

function setLoading(button, isLoading, label) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "One moment..." : label;
  button.classList.toggle("opacity-70", isLoading);
  button.classList.toggle("cursor-wait", isLoading);
}

function getInviteCode() {
  return inviteCodeInput.value.trim().toLowerCase();
}

function formatInviteCode(value) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.startsWith("1")) {
    const countryCode = digits.slice(0, 1);
    const areaCode = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const lineNumber = digits.slice(7, 11);

    return [countryCode, areaCode, prefix, lineNumber].filter(Boolean).join("-");
  }

  const areaCode = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const lineNumber = digits.slice(6, 10);

  return [areaCode, prefix, lineNumber].filter(Boolean).join("-");
}

function getTurnstileToken() {
  return turnstileToken;
}

async function callRsvpFunction(body) {
  const response = await fetch(config.rsvpApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The RSVP service returned an invalid response.");
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || "The RSVP service is unavailable.");
  }

  return payload?.data;
}

function renderTurnstile() {
  if (!config.turnstileSiteKey || !window.turnstile || !turnstileWidget || turnstileWidgetId !== null) {
    return;
  }

  turnstileWidgetId = window.turnstile.render(turnstileWidget, {
    sitekey: config.turnstileSiteKey,
    theme: "light",
    callback(token) {
      turnstileToken = token;
    },
    "expired-callback"() {
      turnstileToken = "";
    },
    "error-callback"() {
      turnstileToken = "";
    },
  });
}

function resetTurnstile() {
  turnstileToken = "";

  if (window.turnstile && turnstileWidgetId !== null) {
    window.turnstile.reset(turnstileWidgetId);
  }
}

function fieldId(memberId, fieldName) {
  return `${fieldName}-${memberId}`;
}

function getMemberInput(memberId, fieldName) {
  return document.querySelector(`#${CSS.escape(fieldId(memberId, fieldName))}`);
}

function bindPhoneFormatter(input) {
  input.addEventListener("input", () => {
    input.value = formatPhoneNumber(input.value);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMemberFields(members) {
  memberFields.innerHTML = "";

  members.forEach((member) => {
    const section = document.createElement("section");
    section.className = "rounded-lg border border-ink/10 bg-shell/60 p-4 sm:p-5";
    section.dataset.memberId = member.member_id;

    section.innerHTML = `
      <div class="flex flex-col gap-1 border-b border-ink/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-petal">Guest</p>
          <h3 class="mt-1 font-display text-3xl font-semibold">${escapeHtml(member.full_name)}</h3>
        </div>
        <p class="text-sm text-ink/60">Contact info is optional.</p>
      </div>
      <div class="mt-5">
        <label class="block text-sm font-bold" for="${fieldId(member.member_id, "rsvp-status")}">Will you attend?</label>
        <select id="${fieldId(member.member_id, "rsvp-status")}" class="mt-2 min-h-12 w-full rounded-md border border-ink/20 bg-white px-4 outline-none ring-moss/30 transition focus:border-moss focus:ring-4" required>
            <option value="">Choose one</option>
            <option value="accepted">Joyfully accepts</option>
            <option value="declined">Regretfully declines</option>
        </select>
      </div>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-bold" for="${fieldId(member.member_id, "email")}">Email <span class="font-normal text-ink/50">(optional)</span></label>
          <input id="${fieldId(member.member_id, "email")}" type="email" maxlength="320" autocomplete="email" placeholder="name@example.com" class="mt-2 min-h-12 w-full rounded-md border border-ink/20 bg-white px-4 outline-none ring-moss/30 transition placeholder:text-ink/35 focus:border-moss focus:ring-4" />
        </div>
        <div>
          <label class="block text-sm font-bold" for="${fieldId(member.member_id, "phone")}">Phone <span class="font-normal text-ink/50">(optional)</span></label>
          <input id="${fieldId(member.member_id, "phone")}" type="tel" inputmode="tel" autocomplete="tel" maxlength="14" placeholder="1-404-555-0123" class="mt-2 min-h-12 w-full rounded-md border border-ink/20 bg-white px-4 outline-none ring-moss/30 transition placeholder:text-ink/35 focus:border-moss focus:ring-4" data-phone-input="true" />
        </div>
      </div>
      <div class="mt-4">
        <label class="block text-sm font-bold" for="${fieldId(member.member_id, "notes")}">Notes <span class="font-normal text-ink/50">(optional)</span></label>
        <textarea id="${fieldId(member.member_id, "notes")}" rows="3" maxlength="2000" placeholder="Dietary restrictions, accessibility needs, or anything else we should know." class="mt-2 w-full rounded-md border border-ink/20 bg-white px-4 py-3 outline-none ring-moss/30 transition placeholder:text-ink/35 focus:border-moss focus:ring-4"></textarea>
      </div>
    `;

    memberFields.append(section);

    getMemberInput(member.member_id, "rsvp-status").value = member.rsvp_status || "";
    getMemberInput(member.member_id, "email").value = member.email || "";
    const phoneInput = getMemberInput(member.member_id, "phone");
    phoneInput.value = formatPhoneNumber(member.phone || "");
    bindPhoneFormatter(phoneInput);
    getMemberInput(member.member_id, "notes").value = member.notes || "";
  });
}

async function findGroup() {
  clearAlert();

  if (!isConfigured) {
    setAlert("Add your RSVP API URL in config.js before testing RSVP lookup.", "error");
    return;
  }

  const inviteCode = getInviteCode();
  if (!/^[a-z0-9]{8}$/.test(inviteCode)) {
    setAlert("Enter the 8-character RSVP code from your invitation.", "error");
    return;
  }

  if (!getTurnstileToken()) {
    setAlert("Complete the verification before finding your invitation.", "error");
    return;
  }

  setLoading(lookupButton, true, "Find invite");

  let data;
  try {
    data = await callRsvpFunction({
      action: "lookup",
      inviteCode,
      turnstileToken: getTurnstileToken(),
    });
  } catch (error) {
    setLoading(lookupButton, false, "Find invite");
    resetTurnstile();
    currentGroup = null;
    memberFields.innerHTML = "";
    guestDetails.classList.add("hidden");
    setAlert(error.message || "Something went wrong while finding your invitation.", "error");
    return;
  }

  setLoading(lookupButton, false, "Find invite");

  if (!data || data.length === 0) {
    currentGroup = null;
    memberFields.innerHTML = "";
    guestDetails.classList.add("hidden");
    setAlert("We could not find that RSVP code. Check the code and try again.", "error");
    return;
  }

  currentGroup = data[0];
  groupName.textContent = currentGroup.group_name;
  groupSummary.textContent = `${currentGroup.members.length} invited guest${currentGroup.members.length === 1 ? "" : "s"}`;
  renderMemberFields(currentGroup.members);
  resetTurnstile();
  renderTurnstile();

  guestDetails.classList.remove("hidden");
  setAlert("Invitation found. You can update and send each guest's RSVP.", "success");
}

function buildMemberResponses() {
  return currentGroup.members.map((member) => ({
    member_id: member.member_id,
    rsvp_status: getMemberInput(member.member_id, "rsvp-status").value,
    email: getMemberInput(member.member_id, "email").value,
    phone: getMemberInput(member.member_id, "phone").value,
    notes: getMemberInput(member.member_id, "notes").value,
  }));
}

async function submitRsvp(event) {
  event.preventDefault();
  clearAlert();

  if (!currentGroup) {
    setAlert("Find your invitation before sending an RSVP.", "error");
    return;
  }

  const memberResponses = buildMemberResponses();
  if (memberResponses.some((member) => !member.rsvp_status)) {
    setAlert("Choose whether each invited guest will attend.", "error");
    return;
  }

  if (!getTurnstileToken()) {
    setAlert("Complete the verification before sending your RSVP.", "error");
    return;
  }

  setLoading(submitButton, true, "Send RSVP");

  try {
    await callRsvpFunction({
      action: "submit",
      inviteCode: getInviteCode(),
      memberResponses,
      turnstileToken: getTurnstileToken(),
    });
  } catch (error) {
    setLoading(submitButton, false, "Send RSVP");
    resetTurnstile();
    setAlert(error.message || "Something went wrong while sending your RSVP.", "error");
    return;
  }

  setLoading(submitButton, false, "Send RSVP");
  resetTurnstile();

  setAlert("Thank you. Your RSVP has been saved.", "success");
}

lookupButton.addEventListener("click", findGroup);
form.addEventListener("submit", submitRsvp);
inviteCodeInput.addEventListener("input", () => {
  inviteCodeInput.value = formatInviteCode(inviteCodeInput.value);
});
inviteCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    findGroup();
  }
});
window.addEventListener("load", renderTurnstile);
