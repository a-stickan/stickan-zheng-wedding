const config = window.WEDDING_CONFIG || {};
const isConfigured =
  config.supabaseUrl &&
  config.supabasePublishableKey &&
  !config.supabaseUrl.includes("YOUR_PROJECT") &&
  !config.supabasePublishableKey.includes("YOUR_SUPABASE");

const supabaseClient = isConfigured
  ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
  : null;

const form = document.querySelector("#rsvp-form");
const alertBox = document.querySelector("#form-alert");
const lookupButton = document.querySelector("#lookup-button");
const submitButton = document.querySelector("#submit-button");
const inviteCodeInput = document.querySelector("#invite-code");
const guestDetails = document.querySelector("#guest-details");
const groupName = document.querySelector("#group-name");
const groupSummary = document.querySelector("#group-summary");
const memberFields = document.querySelector("#member-fields");

let currentGroup = null;

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

async function callRsvpFunction(body) {
  const { data, error } = await supabaseClient.functions.invoke("rsvp", {
    body,
  });

  if (error) {
    throw new Error(error.message || "The RSVP service is unavailable.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.data;
}

function fieldId(memberId, fieldName) {
  return `${fieldName}-${memberId}`;
}

function getMemberInput(memberId, fieldName) {
  return document.querySelector(`#${CSS.escape(fieldId(memberId, fieldName))}`);
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
    section.className = "rounded-md border border-ink/10 p-4";
    section.dataset.memberId = member.member_id;

    section.innerHTML = `
      <h3 class="font-display text-2xl font-semibold">${escapeHtml(member.full_name)}</h3>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-bold" for="${fieldId(member.member_id, "rsvp-status")}">Will you attend?</label>
          <select id="${fieldId(member.member_id, "rsvp-status")}" class="mt-2 min-h-12 w-full rounded-md border border-ink/20 px-4 outline-none ring-moss/30 focus:border-moss focus:ring-4" required>
            <option value="">Choose one</option>
            <option value="accepted">Joyfully accepts</option>
            <option value="declined">Regretfully declines</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-bold" for="${fieldId(member.member_id, "email")}">Email</label>
          <input id="${fieldId(member.member_id, "email")}" type="email" maxlength="320" class="mt-2 min-h-12 w-full rounded-md border border-ink/20 px-4 outline-none ring-moss/30 focus:border-moss focus:ring-4" />
        </div>
        <div>
          <label class="block text-sm font-bold" for="${fieldId(member.member_id, "phone")}">Phone</label>
          <input id="${fieldId(member.member_id, "phone")}" type="tel" maxlength="50" class="mt-2 min-h-12 w-full rounded-md border border-ink/20 px-4 outline-none ring-moss/30 focus:border-moss focus:ring-4" />
        </div>
      </div>
      <div class="mt-4">
        <label class="block text-sm font-bold" for="${fieldId(member.member_id, "notes")}">Notes</label>
        <textarea id="${fieldId(member.member_id, "notes")}" rows="3" maxlength="2000" class="mt-2 w-full rounded-md border border-ink/20 px-4 py-3 outline-none ring-moss/30 focus:border-moss focus:ring-4"></textarea>
      </div>
    `;

    memberFields.append(section);

    getMemberInput(member.member_id, "rsvp-status").value = member.rsvp_status || "";
    getMemberInput(member.member_id, "email").value = member.email || "";
    getMemberInput(member.member_id, "phone").value = member.phone || "";
    getMemberInput(member.member_id, "notes").value = member.notes || "";
  });
}

async function findGroup() {
  clearAlert();

  if (!supabaseClient) {
    setAlert("Add your Supabase URL and publishable key in config.js before testing RSVP lookup.", "error");
    return;
  }

  const inviteCode = getInviteCode();
  if (!inviteCode) {
    setAlert("Enter your invitation UUID first.", "error");
    return;
  }

  setLoading(lookupButton, true, "Find invite");

  let data;
  try {
    data = await callRsvpFunction({
      action: "lookup",
      inviteCode,
    });
  } catch (error) {
    setLoading(lookupButton, false, "Find invite");
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
    setAlert("We could not find that invitation UUID. Check the code and try again.", "error");
    return;
  }

  currentGroup = data[0];
  groupName.textContent = currentGroup.group_name;
  groupSummary.textContent = `${currentGroup.members.length} invited guest${currentGroup.members.length === 1 ? "" : "s"}`;
  renderMemberFields(currentGroup.members);

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

  setLoading(submitButton, true, "Send RSVP");

  try {
    await callRsvpFunction({
      action: "submit",
      inviteCode: getInviteCode(),
      memberResponses,
    });
  } catch (error) {
    setLoading(submitButton, false, "Send RSVP");
    setAlert(error.message || "Something went wrong while sending your RSVP.", "error");
    return;
  }

  setLoading(submitButton, false, "Send RSVP");

  setAlert("Thank you. Your RSVP has been saved.", "success");
}

lookupButton.addEventListener("click", findGroup);
form.addEventListener("submit", submitRsvp);
inviteCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    findGroup();
  }
});
