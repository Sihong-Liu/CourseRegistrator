// helpers
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const isJSON = res.headers.get('content-type')?.includes('application/json');
  const body = isJSON ? await res.json() : await res.text();
  if (!res.ok) {
    const err = typeof body === 'object' && body?.error ? body.error : String(body);
    throw new Error(err || `HTTP ${res.status}`);
  }
  return body;
}
function fmt(dt) { return dt || '—'; } // simple guard for display

function setMsg(text, isError = false) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.style.color = isError ? 'crimson' : '#555';
  el.textContent = text || '';
}




// Courses (list/add/delete)
async function loadCourses() {
  try {
    const list = await api('/api/courses');
    const ul = document.getElementById('courseList');
    ul.innerHTML = '';

    if (!list.length) {
      ul.innerHTML = '<li>No courses yet.</li>';
      return;
    }

    for (const c of list) {
      const li = document.createElement('li');

      const text = document.createElement('span');
      text.textContent = `${c.term} sec ${c.section} — ${c.courseName} (members: ${c.memberCount})`;

      const btn = document.createElement('button');
      btn.textContent = 'Delete';
      btn.style.marginLeft = '8px';
      btn.addEventListener('click', () => deleteCourse(c.term, c.section));

      li.appendChild(text);
      li.appendChild(btn);
      ul.appendChild(li);
    }
  } catch (e) {
    setMsg(`Failed to load courses: ${e.message}`, true);
  }
}

async function deleteCourse(term, section) {
  const ok = confirm(`Delete course ${term} section ${section}? This removes its members, too.`);
  if (!ok) return;

  try {
    await api(`/api/courses/${term}/${section}`, { method: 'DELETE' });
    setMsg(`Deleted ${term} sec ${section}.`);
    await loadCourses();
    await populateCourseSelect();      // refresh Members dropdown
    await populateSheetCourseSelect(); // refresh Sheets dropdown
    // also clear dependent lists
    document.getElementById('sheetList').innerHTML = '<li>No sheets yet.</li>';
    document.getElementById('slotList').innerHTML = '<li>No slots loaded.</li>';
    document.getElementById('signupList').innerHTML = '<li>No slot selected.</li>';
  } catch (e) {
    setMsg(`Delete failed: ${e.message}`, true);
  }
}

async function addCourse() {
  const termEl = document.getElementById('termInput');//getting the input elements
  const secEl  = document.getElementById('sectionInput');
  const nameEl = document.getElementById('nameInput');

  const term = Number(termEl.value);
  const section = secEl.value ? Number(secEl.value) : undefined;
  const courseName = nameEl.value.trim();

  try {
    await api('/api/courses', {
      method: 'POST',
      body: JSON.stringify({ term, section, courseName })//use the input values to create the course in DB
    });
    setMsg('Course added.');
    termEl.value = '';//clearing the input fields
    secEl.value = '';
    nameEl.value = '';
    await loadCourses();
    await populateCourseSelect();
    await populateSheetCourseSelect();
  } catch (e) {
    setMsg(e.message, true);
  }
}




// Members (select course, list/add/delete)

function getSelectedCourse() {
  const val = document.getElementById('courseSelect').value;
  if (!val) return null;
  const [term, section] = val.split('-');//get the selected course's term and section in order to use in API calls
  return { term, section };
}

async function populateCourseSelect() {
  try {
    const list = await api('/api/courses');
    const sel = document.getElementById('courseSelect');
    sel.innerHTML = '<option value="">-- Choose a course --</option>';
    for (const c of list) {
      const opt = document.createElement('option');
      opt.value = `${c.term}-${c.section}`;
      opt.textContent = `${c.term} sec ${c.section} — ${c.courseName}`;
      sel.appendChild(opt);
    }
  } catch (e) {
    setMsg(`Failed to populate courses: ${e.message}`, true);
  }
}

async function loadMembers(role = '') {
  const course = getSelectedCourse();
  if (!course) {
    setMsg('Select a course first.', true);
    return;
  }

  const url = role
    ? `/api/courses/${course.term}/${course.section}/members?role=${role}`
    : `/api/courses/${course.term}/${course.section}/members`;

  try {
    const members = await api(url);
    const ul = document.getElementById('memberList');
    ul.innerHTML = '';

    if (!members.length) {
      ul.innerHTML = '<li>No members found.</li>';
      return;
    }

    for (const m of members) {
      const li = document.createElement('li');
      li.textContent = `${m.id} — ${m.firstName} ${m.lastName} (${m.role || 'N/A'})`;

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.style.marginLeft = '8px';
      del.addEventListener('click', () => deleteMember(m.id));

      li.appendChild(del);
      ul.appendChild(li);
    }
  } catch (e) {
    setMsg(`Load members failed: ${e.message}`, true);
  }
}

async function addMember() {
  const course = getSelectedCourse();
  if (!course) return setMsg('Select a course first.', true);

  const id = document.getElementById('memberId').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const role = document.getElementById('role').value.trim();

  if (id.length !== 8) {
    setMsg('Member ID must be exactly 8 characters.', true);
    return;
  }

  try {
    const body = { members: [{ id, firstName, lastName, role }] };
    await api(`/api/courses/${course.term}/${course.section}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setMsg('Member added.');
    document.getElementById('memberId').value = '';
    document.getElementById('firstName').value = '';
    document.getElementById('lastName').value = '';
    document.getElementById('role').value = '';
    await loadMembers();
  } catch (e) {
    setMsg(`Add failed: ${e.message}`, true);
  }
}

async function deleteMember(id) {
  const course = getSelectedCourse();
  if (!course) return;
  const ok = confirm(`Remove ${id} from course ${course.term}-${course.section}?`);
  if (!ok) return;
  try {
    await api(`/api/courses/${course.term}/${course.section}/members`, {
      method: 'DELETE',
      body: JSON.stringify({ ids: [id] }),
    });
    setMsg(`Deleted member ${id}.`);
    await loadMembers();
  } catch (e) {
    setMsg(`Delete failed: ${e.message}`, true);
  }
}


// Sheets & Slots
async function populateSheetCourseSelect() {
  try {
    const list = await api('/api/courses');
    const sel = document.getElementById('sheetCourseSelect');
    sel.innerHTML = '<option value="">-- Choose a course --</option>';
    for (const c of list) {
      const opt = document.createElement('option');
      opt.value = `${c.term}-${c.section}`;
      opt.textContent = `${c.term} sec ${c.section} — ${c.courseName}`;
      sel.appendChild(opt);
    }
  } catch (e) {
    setMsg(`Failed to load courses: ${e.message}`, true);
  }
}

function getSelectedSheetCourse() {
  const val = document.getElementById('sheetCourseSelect').value;
  if (!val) return null;
  const [term, section] = val.split('-');
  return { term, section };
}

let currentSheetId = null;  // which sheet is selected for slots
let currentSlotId  = null;  // which slot is selected for sign-ups

function selectSheet(id) {
  currentSheetId = id;
  const lis = document.querySelectorAll('#sheetList li');
  lis.forEach(li => li.classList.toggle('selected', li.dataset.id === String(id)));
  const sheetLbl = document.getElementById('selectedSheetLabel');
  if (sheetLbl) sheetLbl.textContent = `Selected Sheet: ${id}`;
}


async function loadSheets() {
  const c = getSelectedSheetCourse();
  if (!c) return setMsg('Select a course first.', true);

  try {
    const sheets = await api(`/api/courses/${c.term}/${c.section}/sheets`);
    const ul = document.getElementById('sheetList');
    ul.innerHTML = '';

    if (!sheets.length) {
      ul.innerHTML = '<li>No sheets found.</li>';
      currentSheetId = null;
      document.getElementById('slotList').innerHTML = '<li>No slots loaded.</li>';
      document.getElementById('signupList').innerHTML = '<li>No slot selected.</li>';
      return;
    }

    for (const s of sheets) {
      const li = document.createElement('li');
      li.dataset.id = String(s.sheetId);
      const text = document.createElement('span');
      text.textContent = `${s.sheetId} — ${s.title} (${fmt(s.openTime)} → ${fmt(s.closeTime)})`;
      li.appendChild(text);


      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View Slots';
      viewBtn.addEventListener('click', () => {
        selectSheet(s.sheetId);
        loadSlots(s.sheetId);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteSheet(c, s.sheetId));

      li.appendChild(viewBtn);
      li.appendChild(delBtn);
      ul.appendChild(li);
    }
  } catch (e) {
    setMsg(`Failed to load sheets: ${e.message}`, true);
  }
}

async function addSheet() {
  const c = getSelectedSheetCourse();
  if (!c) return setMsg('Select a course first.', true);

  const title = document.getElementById('sheetTitle').value.trim();
  const openTime = document.getElementById('sheetOpenTime').value;
  const closeTime = document.getElementById('sheetCloseTime').value;

  if (!title) return setMsg('Sheet title required.', true);

  try {
    await api(`/api/courses/${c.term}/${c.section}/sheets`, {
      method: 'POST',
      body: JSON.stringify({ title, openTime, closeTime }),
    });
    setMsg('Sheet added.');
    document.getElementById('sheetTitle').value = '';
    document.getElementById('sheetOpenTime').value = '';
    document.getElementById('sheetCloseTime').value = '';
    await loadSheets();
  } catch (e) {
    setMsg(`Add sheet failed: ${e.message}`, true);
  }
}

async function deleteSheet(course, id) {
  const ok = confirm(`Delete sheet ${id}?`);
  if (!ok) return;
  try {
    await api(`/api/courses/${course.term}/${course.section}/sheets/${id}`, { method: 'DELETE' });
    setMsg(`Deleted sheet ${id}.`);
    await loadSheets();
  } catch (e) {
    setMsg(`Delete failed: ${e.message}`, true);
  }
}

async function loadSlots(sheetId) {
  selectSheet(sheetId);
  currentSlotId = null;
  const slotLbl = document.getElementById('selectedSlotLabel');
  if (slotLbl) slotLbl.textContent = 'Selected Slot: none';

  try {
    const slots = await api(`/api/sheets/${sheetId}/slots`);
    const ul = document.getElementById('slotList');
    ul.innerHTML = '';
    const gradeSlotSel = document.getElementById('grade-slot-select');
    
    if (!slots.length) {
      ul.innerHTML = '<li>No slots.</li>';
      document.getElementById('signupList').innerHTML = '<li>No slot selected.</li>';
      return;
    }

    if (gradeSlotSel) {//fill the grading slot select dropdown
      gradeSlotSel.innerHTML = '<option value="">-- Select slot --</option>';
      for (const s of slots) {
        const opt = document.createElement('option');
        opt.value = s.slotId;
        opt.textContent = `${s.slotId}: ${fmt(s.startTime)} → ${fmt(s.endTime)} (cap ${s.capacity})`;
        gradeSlotSel.appendChild(opt);
      }
    }
    
    for (const s of slots) {//list all slots
      const li = document.createElement('li');
      li.dataset.id = String(s.slotId);

      const used = (s.signups || []).length;
      const cap = s.capacity;
      const span = document.createElement('span');
      span.textContent = `${s.slotId}: ${fmt(s.startTime)} → ${fmt(s.endTime)} (cap ${cap})`;

      const badge = document.createElement('span');
      badge.className = 'badge' + (used >= cap ? ' full' : '');
      badge.textContent = `${used}/${cap}`;

      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View Sign-ups';
      viewBtn.addEventListener('click', () => {
        // highlight selection
        document.querySelectorAll('#slotList li').forEach(x =>
          x.classList.toggle('selected', x.dataset.id === String(s.slotId)));
        loadSignups(s.slotId);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteSlot(sheetId, s.slotId));

      li.appendChild(span);
      li.appendChild(badge);
      li.appendChild(viewBtn);
      li.appendChild(delBtn);
      ul.appendChild(li);
    }
  } catch (e) {
    setMsg(`Failed to load slots: ${e.message}`, true);
  }
}


async function addSlot() {
  if (!currentSheetId) return setMsg('Select a sheet first (click "View Slots" on a sheet).', true);

  const startTime = document.getElementById('slotStart').value;
  const endTime   = document.getElementById('slotEnd').value;
  const capacity  = parseInt(document.getElementById('slotCap').value, 10) || 1;

  // basic validation: end > start (only if both provided)
  if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
    return setMsg('End time must be after start time.', true);
  }

  try {
    await api(`/api/sheets/${currentSheetId}/slots`, {
      method: 'POST',
      body: JSON.stringify({ startTime, endTime, capacity }),
    });
    setMsg('Slot added.');
    document.getElementById('slotStart').value = '';
    document.getElementById('slotEnd').value = '';
    document.getElementById('slotCap').value = '';
    await loadSlots(currentSheetId);
  } catch (e) {
    setMsg(`Add slot failed: ${e.message}`, true);
  }
}

async function deleteSlot(sheetId, slotId) {
  const ok = confirm(`Delete slot ${slotId}?`);
  if (!ok) return;
  try {
    await api(`/api/sheets/${sheetId}/slots/${slotId}`, { method: 'DELETE' });
    setMsg(`Deleted slot ${slotId}.`);
    await loadSlots(sheetId);
  } catch (e) {
    setMsg(`Delete slot failed: ${e.message}`, true);
  }
}

//signups per slot
async function loadSignups(slotId) {
  currentSlotId = slotId;
  const slotLbl = document.getElementById('selectedSlotLabel');
  if (slotLbl) slotLbl.textContent = `Selected Slot: ${slotId}`;
  try {
    const list = await api(`/api/slots/${slotId}/signups`);
    const ul = document.getElementById('signupList');
    ul.innerHTML = '';

    if (!list.length) {
      ul.innerHTML = '<li>No sign-ups yet.</li>';
      return;
    }

    for (const id of list) {
      const li = document.createElement('li');
      li.textContent = id;

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Cancel';
      delBtn.addEventListener('click', () => cancelSignup(slotId, id));

      li.appendChild(delBtn);
      ul.appendChild(li);
    }
  } catch (e) {
    setMsg(`Failed to load signups: ${e.message}`, true);
  }
}

async function signupMember() {
  const memberId = document.getElementById('signupMemberId').value.trim();
  if (!memberId || memberId.length !== 8)
    return setMsg('Member ID must be exactly 8 characters.', true);

  if (!currentSlotId)
    return setMsg('Select a slot first using "View Sign-ups".', true);

  try {
    await api(`/api/slots/${currentSlotId}/signup`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    });
    setMsg(`Member ${memberId} signed up.`);
    document.getElementById('signupMemberId').value = '';
    await loadSignups(currentSlotId);
  } catch (e) {
    setMsg(`Signup failed: ${e.message}`, true);
  }
}

async function cancelSignup(slotId, memberId) {
  const ok = confirm(`Remove ${memberId} from slot ${slotId}?`);
  if (!ok) return;
  try {
    await api(`/api/slots/${slotId}/signups/${memberId}`, { method: 'DELETE' });
    setMsg(`Removed ${memberId} from slot ${slotId}.`);
    await loadSignups(slotId);
  } catch (e) {
    setMsg(`Cancel failed: ${e.message}`, true);
  }
}

//Now is grading part

async function loadSlotMembersForGrading() {
  const slotSelect = document.getElementById('grade-slot-select');
  const slotId = slotSelect?.value;
  if (!slotId) {
    setMsg('Select a slot to load members for grading.', true);
    return;
  }

  let data;
  try {
    data = await api(`/api/slots/${slotId}/members`);
  } catch (e) {
    setMsg(`Failed to load members for slot: ${e.message}`, true);
    return;
  }

  const tbody = document.querySelector('#grade-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.members.forEach(member => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${member.memberId}</td>
      <td>${member.firstName} ${member.lastName}</td>
      <td>${member.role}</td>
      <td>${member.grade ?? ''}</td>
      <td>
        <input type="number"
               min="0" max="999"
               value="${member.grade ?? ''}"
               data-member-id="${member.memberId}"
               class="grade-input">
      </td>
      <td>
        <input type="text"
               maxlength="500"
               placeholder="New comment to append"
               data-member-id="${member.memberId}"
               class="comment-input">
      </td>
      <td>
        <button class="save-grade-btn"
                data-member-id="${member.memberId}"
                data-sheet-id="${data.sheetId}">
          Save
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Hook up click handlers for save buttons
  tbody.querySelectorAll('.save-grade-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const memberId = e.target.dataset.memberId;
      const sheetId  = e.target.dataset.sheetId;

      const gradeInput = tbody.querySelector(`.grade-input[data-member-id="${memberId}"]`);
      const commentInput = tbody.querySelector(`.comment-input[data-member-id="${memberId}"]`);

      const grade = gradeInput.value;
      const comment = commentInput.value;

      if (!grade) {
        setMsg('Please enter a grade.', true);
        return;
      }

      try {
        const result = await api('/api/grade', {
          method: 'POST',
          body: JSON.stringify({ sheetId, memberId, grade, comment }),
        });

        alert(`Saved grade. Original: ${result.originalGrade ?? 'N/A'}, Now: ${result.updatedGrade}`);
        // Reload table to show updated grade/comment
        await loadSlotMembersForGrading();
      } catch (err) {
        setMsg(`Failed to save grade: ${err.message}`, true);
      }
    });
  });
}

async function loadGradeCourses() {
  const select = document.getElementById('grade-course-select');
  if (!select) return;

  select.innerHTML = '<option value="">-- Select course --</option>';

  try {
    const courses = await api('/api/courses');
    for (const c of courses) {
      const opt = document.createElement('option');
      opt.value = `${c.term}-${c.section}`;
      opt.textContent = `${c.term} - Sec ${c.section} - ${c.courseName}`;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to load courses for grading: ' + err.message);
  }
}

async function loadGradeSheets() {
  const courseSel = document.getElementById('grade-course-select');
  const sheetSel  = document.getElementById('grade-sheet-select');
  const slotSel   = document.getElementById('grade-slot-select');
  if (!courseSel || !sheetSel || !slotSel) return;

  sheetSel.innerHTML = '<option value="">-- Select sheet --</option>';
  slotSel.innerHTML  = '<option value="">-- Select slot --</option>';

  const value = courseSel.value;
  if (!value) return;

  const [termStr, sectionStr] = value.split('-');
  const term = Number(termStr);
  const section = Number(sectionStr);

  try {
    const sheets = await api(`/api/courses/${term}/${section}/sheets`);
    for (const s of sheets) {
      const opt = document.createElement('option');
      opt.value = s.sheetId;
      opt.textContent = `${s.sheetId}: ${s.title}`;
      sheetSel.appendChild(opt);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to load sheets: ' + err.message);
  }
}

async function loadGradeSlots() {
  const sheetSel = document.getElementById('grade-sheet-select');
  const slotSel  = document.getElementById('grade-slot-select');
  if (!sheetSel || !slotSel) return;

  slotSel.innerHTML = '<option value="">-- Select slot --</option>';

  const sheetId = sheetSel.value;
  if (!sheetId) return;

  try {
    const slots = await api(`/api/sheets/${sheetId}/slots`);
    for (const slot of slots) {
      const opt = document.createElement('option');
      opt.value = slot.slotId;
      opt.textContent = `${slot.slotId}: ${slot.startTime} → ${slot.endTime} (cap ${slot.capacity})`;
      slotSel.appendChild(opt);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to load slots: ' + err.message);
  }
}

async function loadSlotMembersForGrading() {//when load members for grading button is clicked
  const slotSelect = document.getElementById('grade-slot-select');
  const slotId = slotSelect?.value;
  if (!slotId) {
    alert('Please select a slot first.');
    return;
  }

  let payload;
  try {
    payload = await api(`/api/slots/${slotId}/members`);
  } catch (err) {
    console.error(err);
    alert('Failed to load members: ' + err.message);
    return;
  }

  const tbody = document.querySelector('#grade-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  payload.members.forEach(member => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${member.memberId}</td>
      <td>${member.firstName} ${member.lastName}</td>
      <td>${member.role}</td>
      <td>${member.grade ?? ''}</td>
      <td>
        <input type="number"
               min="0" max="999"
               value="${member.grade ?? ''}"
               data-member-id="${member.memberId}"
               class="grade-input" />
      </td>
      <td>
        <input type="text"
               maxlength="500"
               placeholder="New comment to append"
               data-member-id="${member.memberId}"
               class="comment-input" />
      </td>
      <td>
        <button class="save-grade-btn"
                data-member-id="${member.memberId}"
                data-sheet-id="${payload.sheetId}">
          Save
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach click handlers for each "Save" button
  tbody.querySelectorAll('.save-grade-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const memberId = e.target.dataset.memberId;
      const sheetId  = e.target.dataset.sheetId;

      const gradeInput = tbody.querySelector(`.grade-input[data-member-id="${memberId}"]`);
      const commentInput = tbody.querySelector(`.comment-input[data-member-id="${memberId}"]`);

      const grade = gradeInput.value;
      const comment = commentInput.value;

      if (!grade) {
        alert('Please enter a grade.');
        return;
      }

      try {
        const result = await api('/api/grade', {
          method: 'POST',
          body: JSON.stringify({ sheetId, memberId, grade, comment })
        });

        alert(`Saved grade. Original: ${result.originalGrade ?? 'N/A'}, New: ${result.updatedGrade}`);
        // Reload table to show updated grade/comment
        await loadSlotMembersForGrading();
      } catch (err2) {
        console.error(err2);
        alert('Failed to save grade: ' + err2.message);
      }
    });
  });
}



// Single initializer
document.addEventListener('DOMContentLoaded', () => {
  // Courses
  document.getElementById('addBtn').addEventListener('click', addCourse);
  loadCourses();

  // Members
  populateCourseSelect();
  document.getElementById('loadMembersBtn').addEventListener('click', () => loadMembers());
  document.getElementById('showAllBtn').addEventListener('click', () => loadMembers());
  document.getElementById('showStudentsBtn').addEventListener('click', () => loadMembers('student'));
  document.getElementById('showInstructorsBtn').addEventListener('click', () => loadMembers('instructor'));
  document.getElementById('addMemberBtn').addEventListener('click', addMember);

  // Sheets & Slots & Sign-ups
  populateSheetCourseSelect();
  document.getElementById('loadSheetsBtn').addEventListener('click', loadSheets);
  document.getElementById('addSheetBtn').addEventListener('click', addSheet);
  document.getElementById('addSlotBtn').addEventListener('click', addSlot);
  document.getElementById('signupBtn').addEventListener('click', signupMember);

    //Grading section wiring
  loadGradeCourses();  // fill course dropdown

  const gradeCourseSel = document.getElementById('grade-course-select');
  const gradeSheetSel  = document.getElementById('grade-sheet-select');
  const loadBtn        = document.getElementById('load-slot-members-btn');

  if (gradeCourseSel) {
    gradeCourseSel.addEventListener('change', loadGradeSheets);
  }
  if (gradeSheetSel) {
    gradeSheetSel.addEventListener('change', loadGradeSlots);
  }
  if (loadBtn) {
    loadBtn.addEventListener('click', loadSlotMembersForGrading);
  }

});
