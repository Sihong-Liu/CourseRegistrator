// client/src/pages/TaDashboard.jsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';
export default function TaDashboard() {
    const { user } = useAuth();
    // Courses
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null); // {term, section, courseName}
    // Members
    const [members, setMembers] = useState([]);
    const [memberForm, setMemberForm] = useState({
        memberId: '',
        firstName: '',
        lastName: '',
        username: ''
    });
    // Sheets
    const [sheets, setSheets] = useState([]);
    const [sheetForm, setSheetForm] = useState({
        title: '',
        openTime: '',
        closeTime: ''
    });
    const [selectedSheetId, setSelectedSheetId] = useState(null);
    // Slots
    const [slots, setSlots] = useState([]);
    const [slotForm, setSlotForm] = useState({
        startTime: '',
        endTime: '',
        capacity: 1
    });
    const [editingSlotId, setEditingSlotId] = useState(null)
    // Grading
    const [gradingSlotId, setGradingSlotId] = useState('');
    const [gradingData, setGradingData] = useState(null); // {slotId, sheetId, members: [...]}
    const [gradeForm, setGradeForm] = useState({
        memberId: '',
        grade: '',
        bonus: '',
        penalty: '',
        comment: ''
    });
    // Messages
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // Helpers
    function clearMessages() {
        setMsg('');
        setError('');
    }
    function fmtDate(dt) {
        if (!dt) return '—';
        const d = new Date(dt);
        if (Number.isNaN(d.getTime())) return dt;
        return d.toLocaleString();
    }


    // Load courses on mount
    useEffect(() => {
        loadCourses();
    }, []);
    async function loadCourses() {
        clearMessages();
        try {
        const list = await api('/api/courses');
        setCourses(list);
        if (list.length && !selectedCourse) {
            selectCourse(list[0]);
        }
        } catch (e) {
        setError(e.message);
        }
    }
    async function selectCourse(course) {
        setSelectedCourse(course);
        setSelectedSheetId(null);
        setSlots([]);
        clearMessages();
        if (!course) return;
        await Promise.all([loadMembers(course), loadSheets(course)]);
    }
    async function loadMembers(course) {
        try {
        const res = await api(
            `/api/courses/${course.term}/${course.section}/members`
        );
        setMembers(res.members || []);
        } catch (e) {
            setError(e.message);
        }
    }
    async function loadSheets(course) {
        try {
            const res = await api(
                `/api/courses/${course.term}/${course.section}/sheets`
            );
            setSheets(res || []);
        } catch (e) {
            setError(e.message);
        }
    }
    async function loadSlotsForSheet(sheetId) {
        setSelectedSheetId(sheetId);
        clearMessages();
        if (!sheetId) {
            setSlots([]);
            return;
        }
        try {
            const res = await api(`/api/sheets/${sheetId}/slots`, {
                method: 'GET'
            });
            setSlots(res || []);
        } catch (e) {
            setError(e.message);
        }
    }
    // Forms
    async function handleAddCourse(e) {
        e.preventDefault();
        clearMessages();
        const term = Number(e.target.term.value);
        const section = e.target.section.value
        ? Number(e.target.section.value)
        : undefined;
        const courseName = e.target.courseName.value.trim();
        if (!term || !courseName) {
            setError('Please enter term and course name.');
            return;
        }
        try {
            setLoading(true);
            await api('/api/courses', {
                method: 'POST',
                body: JSON.stringify({ term, section, courseName })
            });
            setMsg('Course added.');
            e.target.reset();
            await loadCourses();
        } catch (e2) {
            setError(e2.message);
        } finally {
            setLoading(false);
        }
    }
    async function handleAddMember(e) {
        e.preventDefault();
        clearMessages();
        if (!selectedCourse) {
            setError('Select a course first.');
            return;
        }
        const body = {
            memberId: memberForm.memberId,
            firstName: memberForm.firstName.trim(),
            lastName: memberForm.lastName.trim(),
            username: memberForm.username.trim() || null
        };
        if (!body.memberId || !body.firstName || !body.lastName) {
            setError('memberId, firstName, lastName are required.');
            return;
        }
        try {
            setLoading(true);
            await api(
                `/api/courses/${selectedCourse.term}/${selectedCourse.section}/members`,
                {
                method: 'POST',
                body: JSON.stringify(body)
                }
            );
            setMsg('Member added.');
            setMemberForm({ memberId: '', firstName: '', lastName: '', username: '' });
            await loadMembers(selectedCourse);
        } catch (e2) {
            setError(e2.message);
        } finally {
            setLoading(false);
        }
    }
    async function handleDeleteMember(memberId) {
        clearMessages();
        if (!selectedCourse) {
            setError('Select a course first.');
            return;
        }

        if (!window.confirm(`Remove member ${memberId} from this course?`)) {
            return;
        }

        try {
            setLoading(true);
            await api(
                `/api/courses/${selectedCourse.term}/${selectedCourse.section}/members/${memberId}`,
                { method: 'DELETE' }
            );
            setMsg(`Member ${memberId} removed from course.`);
            await loadMembers(selectedCourse);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }


    async function handleAddSheet(e) {
        e.preventDefault();
        clearMessages();
        if (!selectedCourse) {
            setError('Select a course first.');
            return;
        }
        const body = {
            title: sheetForm.title.trim(),
            openTime: sheetForm.openTime,
            closeTime: sheetForm.closeTime
        };
        if (!body.title) {
            setError('Title is required.');
            return;
        }
        try {
            setLoading(true);
            await api(
                `/api/courses/${selectedCourse.term}/${selectedCourse.section}/sheets`,
                {
                method: 'POST',
                body: JSON.stringify(body)
                }
            );
            setMsg('Sheet added.');
            setSheetForm({ title: '', openTime: '', closeTime: '' });
            await loadSheets(selectedCourse);
        } catch (e2) {
            setError(e2.message);
        } finally {
            setLoading(false);
        }
    }
    async function handleSaveSlot(e) {
        e.preventDefault();
        clearMessages();
        if (!selectedSheetId) {
            setError('Select a sheet first.');
            return;
        }
        const body = {
            startTime: slotForm.startTime,
            endTime: slotForm.endTime,
            capacity: Number(slotForm.capacity) || 1
        };
        if (!body.startTime || !body.endTime) {
            setError('Start and end time are required.');
            return;
        }
        //now fixed the issue of no date validation for adding slot
        const currentSheet = sheets.find(s => s.sheetId === selectedSheetId);
        if (currentSheet && (currentSheet.openTime || currentSheet.closeTime)) {
            const start = new Date(body.startTime);
            const end = new Date(body.endTime);
            const open = currentSheet.openTime ? new Date(currentSheet.openTime) : null;
            const close = currentSheet.closeTime ? new Date(currentSheet.closeTime) : null;

            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                setError('Invalid start or end time.');
                return;
            }
            if (open && start < open) {
                setError('Slot start time must be on or after sheet open time.');
                return;
            }
            if (close && end > close) {
                setError('Slot end time must be on or before sheet close time.');
                return;
            }
        }
        try {
            setLoading(true);
            if (editingSlotId) {
            // UPDATE existing slot
            await api(`/api/sheets/${selectedSheetId}/slots/${editingSlotId}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            setMsg(`Slot ${editingSlotId} updated.`);
            } else {
            // CREATE new slot
            await api(`/api/sheets/${selectedSheetId}/slots`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            setMsg('Slot added.');
            }

            setSlotForm({ startTime: '', endTime: '', capacity: 1 });
            setEditingSlotId(null);
            await loadSlotsForSheet(selectedSheetId);
        } catch (e2) {
            setError(e2.message);
        } finally {
            setLoading(false);
        }
    }

    function startEditSlot(slot) {
        clearMessages();
        setEditingSlotId(slot.slotId);

        // Convert start/end to datetime-local value if possible
        const toLocalInput = (value) => {
            if (!value) return '';
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return '';
            // datetime-local wants "YYYY-MM-DDTHH:MM"
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        setSlotForm({
            startTime: toLocalInput(slot.start),
            endTime: toLocalInput(slot.end || slot.finish || slot.start), // fallback
            capacity: slot.maxMembers ?? slot.capacity ?? 1
        });
    }

    async function handleDeleteSheet(sheetId) {
        clearMessages();

        if (!selectedCourse) {
            setError('Select a course first.');
            return;
        }

        if (!window.confirm(`Delete sheet #${sheetId}? This cannot be undone.`)) return;

        try {
            setLoading(true);
            await api(
            `/api/courses/${selectedCourse.term}/${selectedCourse.section}/sheets/${sheetId}`,
            { method: 'DELETE' }
            );
            setMsg(`Sheet ${sheetId} deleted.`);
            await loadSheets(selectedCourse);  // refresh list
            setSelectedSheetId(null);
            setSlots([]);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }


    async function handleDeleteSlot(slotId) {
        clearMessages();
        if (!selectedSheetId) {
            setError("Select a sheet first.");
            return;
        }

        if (!window.confirm(`Delete slot #${slotId}?`)) return;

        try {
            setLoading(true);
            await api(`/api/sheets/${selectedSheetId}/slots/${slotId}`, {
            method: 'DELETE'
            });
            setMsg(`Slot ${slotId} deleted.`);
            await loadSlotsForSheet(selectedSheetId);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }




    // Grading 
    async function loadGradingForSlot(slotId) {
        if (!slotId) {
            setError('Enter a slot ID.');
            return;
        }
        clearMessages();
        try {
            setLoading(true);
            const data = await api(`/api/ta/grading/slot/${slotId}`, {
                method: 'GET'
            });
            setGradingData(data);
            setGradingSlotId(String(slotId));
            setGradeForm(g => ({ ...g, sheetId: data.sheetId, memberId: '' }));
            setMsg('Loaded grading info for slot ' + slotId);
        } catch (e) {
            setError(e.message);
            setGradingData(null);
        } finally {
            setLoading(false);
        }
    }
    async function handleGradeSubmit(e) {
        e.preventDefault();
        clearMessages();
        if (!gradingData) {
            setError('Load a slot first.');
            return;
        }
        if (!gradeForm.memberId) {
        setError('Select a member to grade.');
        return;
        }
        const body = {
        sheetId: gradingData.sheetId,
        memberId: Number(gradeForm.memberId),
        grade:
            gradeForm.grade === '' ? null : Number(gradeForm.grade),
        bonus:
            gradeForm.bonus === '' ? null : Number(gradeForm.bonus),
        penalty:
            gradeForm.penalty === '' ? null : Number(gradeForm.penalty),
        comment: gradeForm.comment.trim()
        };
        try {
        setLoading(true);
        await api('/api/ta/grading/grade', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        setMsg('Grade saved.');
        // reload grading info to refresh table
        await loadGradingForSlot(gradingSlotId);
        } catch (e2) {
        setError(e2.message);
        } finally {
        setLoading(false);
        }
    }




    // Render
    return (
        <section className="card">
        <h2>TA / Admin Dashboard</h2>
        <p>Logged in as {user?.username} ({user?.role})</p>
        {error && <p className="error">{error}</p>}
        {msg && !error && <p className="success">{msg}</p>}
        {loading && <p>Working...</p>}
        {/* Courses */}
        <section className="card inner">
            <h3>Courses</h3>
            <form onSubmit={handleAddCourse} className="inline-form">
            <input
                type="number"
                name="term"
                placeholder="Term (e.g. 1259)"
                min="1"
                required
            />
            <input
                type="number"
                name="section"
                placeholder="Section (default 1)"
                min="1"
            />
            <input
                type="text"
                name="courseName"
                placeholder="Course name"
                required
            />
            <button type="submit" disabled={loading}>Add</button>
            </form>
            <table>
            <thead>
                <tr>
                <th>Term</th>
                <th>Section</th>
                <th>Name</th>
                <th>Members</th>
                <th>Select</th>
                </tr>
            </thead>
            <tbody>
                {courses.map(c => (
                <tr
                    key={`${c.term}-${c.section}`}
                    className={
                    selectedCourse &&
                    c.term === selectedCourse.term &&
                    c.section === selectedCourse.section
                        ? 'selected-row'
                        : ''
                    }
                >
                    <td>{c.term}</td>
                    <td>{c.section}</td>
                    <td>{c.courseName}</td>
                    <td>{c.memberCount}</td>
                    <td>
                    <button
                        type="button"
                        onClick={() => selectCourse(c)}
                    >
                        Select
                    </button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </section>
        {/* Members + Sheets/Slots side by side */}
        {selectedCourse && (
            <div className="ta-panels">
            {/* Members */}
            <section className="card inner">
                <h3>
                Members – Term {selectedCourse.term} Sec {selectedCourse.section}
                </h3>
                <form onSubmit={handleAddMember} className="stack-form">
                <input
                    type="number"
                    placeholder="Member ID"
                    value={memberForm.memberId}
                    onChange={e =>
                    setMemberForm(f => ({ ...f, memberId: e.target.value }))
                    }
                />
                <input
                    type="text"
                    placeholder="First name"
                    value={memberForm.firstName}
                    onChange={e =>
                    setMemberForm(f => ({ ...f, firstName: e.target.value }))
                    }
                />
                <input
                    type="text"
                    placeholder="Last name"
                    value={memberForm.lastName}
                    onChange={e =>
                    setMemberForm(f => ({ ...f, lastName: e.target.value }))
                    }
                />
                <input
                    type="text"
                    placeholder="Username (optional, e.g. student001@lab4)"
                    value={memberForm.username}
                    onChange={e =>
                    setMemberForm(f => ({ ...f, username: e.target.value }))
                    }
                />
                <button type="submit" disabled={loading}>Add member</button>
                </form>
                <table>
                <thead>
                    <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Remove</th>
                    </tr>
                </thead>
                <tbody>
                    {members.map(m => (
                        <tr key={m.memberId}>
                        <td>{m.memberId}</td>
                        <td>{m.firstName} {m.lastName}</td>
                        <td>{m.username || '—'}</td>
                        <td>
                            <button
                                type="button"
                                onClick={() => handleDeleteMember(m.memberId)}
                                disabled={loading}
                            >
                            Remove
                            </button>
                        </td>
                        </tr>
                        )
                    )
                }
                </tbody>
                </table>
            </section>
            {/* Sheets + Slots */}
            <section className="card inner">
                <h3>Signup Sheets &amp; Slots</h3>
                <form onSubmit={handleAddSheet} className="stack-form">
                <input
                    type="text"
                    placeholder="Sheet title (Assignment name)"
                    value={sheetForm.title}
                    onChange={e =>
                    setSheetForm(f => ({ ...f, title: e.target.value }))
                    }
                />
                <label>
                    Open time:
                    <input
                    type="datetime-local"
                    value={sheetForm.openTime}
                    onChange={e =>
                        setSheetForm(f => ({ ...f, openTime: e.target.value }))
                    }
                    />
                </label>
                <label>
                    Close time:
                    <input
                    type="datetime-local"
                    value={sheetForm.closeTime}
                    onChange={e =>
                        setSheetForm(f => ({ ...f, closeTime: e.target.value }))
                    }
                    />
                </label>
                <button type="submit" disabled={loading}>Add sheet</button>
                </form>
                <table>
                <thead>
                    <tr>
                    <th>Sheet ID</th>
                    <th>Title</th>
                    <th>Open</th>
                    <th>Close</th>
                    <th>Slots</th>
                    <th>Delete</th>
                    </tr>
                </thead>
                <tbody>
                    {sheets.map(s => (
                    <tr
                        key={s.sheetId}
                        className={
                        selectedSheetId === s.sheetId ? 'selected-row' : ''
                        }
                    >
                        <td>{s.sheetId}</td>
                        <td>{s.title}</td>
                        <td>{fmtDate(s.openTime)}</td>
                        <td>{fmtDate(s.closeTime)}</td>
                        <td>
                        <button
                            type="button"
                            onClick={() => loadSlotsForSheet(s.sheetId)}
                        >
                            View slots
                        </button>
                        </td>
                        <td>
                            <button type= "button" onClick={() => handleDeleteSheet(s.sheetId)} disabled={loading}>Delete</button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
                {selectedSheetId && (
                <>
                    <h4>Slots for sheet {selectedSheetId}</h4>
                    <form onSubmit={handleSaveSlot} className="stack-form">
                    <label>
                        Start:
                        <input
                        type="datetime-local"
                        value={slotForm.startTime}
                        onChange={e =>
                            setSlotForm(f => ({ ...f, startTime: e.target.value }))
                        }
                        />
                    </label>
                    <label>
                        End:
                        <input
                        type="datetime-local"
                        value={slotForm.endTime}
                        onChange={e =>
                            setSlotForm(f => ({ ...f, endTime: e.target.value }))
                        }
                        />
                    </label>
                    <label>
                        Capacity:
                        <input
                        type="number"
                        min="1"
                        value={slotForm.capacity}
                        onChange={e =>
                            setSlotForm(f => ({
                            ...f,
                            capacity: e.target.value
                            }))
                        }
                        />
                    </label>
                    <button type="submit" disabled={loading}>
                        {editingSlotId ? `Save changes to slot ${editingSlotId}` : 'Add slot'}
                    </button>
                    {editingSlotId && (
                    <button
                        type="button"
                        onClick={() => {
                        setEditingSlotId(null);
                        setSlotForm({ startTime: '', endTime: '', capacity: 1 });
                        clearMessages();
                        }}
                        disabled={loading}
                    >
                        Cancel edit
                    </button>
                    )}

                    </form>
                    <table>
                    <thead>
                        <tr>
                        <th>Slot ID</th>
                        <th>Start</th>
                        <th>Duration (min)</th>
                        <th>Members</th>
                        <th>Edit</th>
                        <th>Delete</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slots.map(sl => (
                            <tr key={sl.slotId}>
                            <td>{sl.slotId}</td>
                            <td>{fmtDate(sl.start)}</td>
                            <td>{sl.slotDuration}</td>
                            <td>
                                {sl.members?.length || 0}/{sl.maxMembers}
                            </td>
                            <td>
                                <button
                                type="button"
                                onClick={() => startEditSlot(sl)}
                                disabled={loading}
                                >
                                Edit
                                </button>
                            </td>
                            <td>
                                <button
                                type="button"
                                onClick={() => handleDeleteSlot(sl.slotId)}
                                disabled={loading}
                                >
                                Delete
                                </button>
                            </td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </>
                )}
            </section>
            </div>
        )}
        {/* Grading panel */}
        <section className="card inner">
            <h3>Grading</h3>
            <div className="inline-form">
            <input
                type="number"
                placeholder="Slot ID"
                value={gradingSlotId}
                onChange={e => setGradingSlotId(e.target.value)}
            />
            <button
                type="button"
                onClick={() => loadGradingForSlot(Number(gradingSlotId))}
                disabled={loading}
            >
                Load slot for grading
            </button>
            </div>
            {gradingData && (
            <>
                <p>
                Slot {gradingData.slotId} – Sheet {gradingData.sheetId} –{' '}
                {gradingData.assignmentName || 'Assignment'}
                </p>
                <table>
                <thead>
                    <tr>
                    <th>Member ID</th>
                    <th>Name</th>
                    <th>Grade</th>
                    <th>Bonus</th>
                    <th>Penalty</th>
                    <th>Comment</th>
                    </tr>
                </thead>
                <tbody>
                    {gradingData.members?.map(m => (
                    <tr key={m.memberId}>
                        <td>{m.memberId}</td>
                        <td>{m.firstName} {m.lastName}</td>
                        <td>{m.grade ?? '—'}</td>
                        <td>{m.bonus ?? '—'}</td>
                        <td>{m.penalty ?? '—'}</td>
                        <td>{m.comment || '—'}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
                <form onSubmit={handleGradeSubmit} className="stack-form">
                <label>
                    Member:
                    <select
                    value={gradeForm.memberId}
                    onChange={e =>
                        setGradeForm(f => ({ ...f, memberId: e.target.value }))
                    }
                    >
                    <option value="">Select member</option>
                    {gradingData.members?.map(m => (
                        <option key={m.memberId} value={m.memberId}>
                        {m.memberId} – {m.firstName} {m.lastName}
                        </option>
                    ))}
                    </select>
                </label>
                <label>
                    Grade:
                    <input
                    type="number"
                    value={gradeForm.grade}
                    onChange={e =>
                        setGradeForm(f => ({ ...f, grade: e.target.value }))
                    }
                    />
                </label>
                <label>
                    Bonus:
                    <input
                    type="number"
                    value={gradeForm.bonus}
                    onChange={e =>
                        setGradeForm(f => ({ ...f, bonus: e.target.value }))
                    }
                    />
                </label>
                <label>
                    Penalty:
                    <input
                    type="number"
                    value={gradeForm.penalty}
                    onChange={e =>
                        setGradeForm(f => ({ ...f, penalty: e.target.value }))
                    }
                    />
                </label>
                <label>
                    Comment:
                    <input
                    type="text"
                    value={gradeForm.comment}
                    onChange={e =>
                        setGradeForm(f => ({ ...f, comment: e.target.value }))
                    }
                    />
                </label>
                <button type="submit" disabled={loading}>Save grade</button>
                </form>
            </>
            )}
        </section>
        {/* ---------------------------------------------------------- */
        /* ADMIN-ONLY SECTION (visible only for role === 'admin') */}
        {user.role === 'admin' && (
            <section className="card inner" style={{ border: '2px solid #b30000' }}>
                <h2>Admin Tools</h2>

                {/* CREATE USER */}
                <h3>Create User</h3>
                <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    clearMessages();
                    const form = new FormData(e.target);
                    const body = {
                    username: form.get('username'),
                    password: form.get('password'),
                    role: form.get('role'),
                    };
                    if (!body.username || !body.password) {
                    setError('Username and password are required.');
                    return;
                    }
                    try {
                    setLoading(true);
                    await api('/api/admin/create-user', {
                        method: 'POST',
                        body: JSON.stringify(body),
                    });
                    setMsg(`User ${body.username} created.`);
                    e.target.reset();
                    } catch (err) {
                    setError(err.message);
                    } finally {
                    setLoading(false);
                    }
                }}
                className="stack-form"
                >
                <input name="username" type="text" placeholder="Username (email)" />
                <input name="password" type="password" placeholder="Initial password" />
                <select name="role">
                    <option value="student">student</option>
                    <option value="ta">ta</option>
                    <option value="admin">admin</option>
                </select>
                <button type="submit">Create User</button>
                </form>

                {/* RESET PASSWORD */}
                <h3>Reset Password</h3>
                <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    clearMessages();
                    const form = new FormData(e.target);
                    const body = {
                    username: form.get('username'),
                    newPassword: form.get('newPassword'),
                    };
                    if (!body.username || !body.newPassword) {
                    setError('Username and new password required.');
                    return;
                    }
                    try {
                    setLoading(true);
                    await api('/api/admin/reset-password', {
                        method: 'POST',
                        body: JSON.stringify(body),
                    });
                    setMsg(`Password reset for ${body.username}`);
                    e.target.reset();
                    } catch (err) {
                    setError(err.message);
                    } finally {
                    setLoading(false);
                    }
                }}
                className="stack-form"
                >
                <input name="username" type="text" placeholder="Username" />
                <input name="newPassword" type="password" placeholder="New password" />
                <button type="submit">Reset Password</button>
                </form>

                {/* IMPORT MEMBERS */}
                <h3>Import Members from CSV</h3>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                Format per line: <code>last, first, username, password</code>
                </p>

                <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    clearMessages();
                    if (!selectedCourse) {
                    setError('Select a course first (top of page).');
                    return;
                    }
                    const text = e.target.csvtext.value.trim();
                    if (!text) {
                    setError('CSV text is empty.');
                    return;
                    }
                    try {
                    setLoading(true);
                    await api(
                        `/api/admin/courses/${selectedCourse.term}/${selectedCourse.section}/import-members`,
                        {
                        method: 'POST',
                        body: JSON.stringify({ csv: text }),
                        }
                    );
                    setMsg('CSV imported successfully.');
                    await loadMembers(selectedCourse); // refresh member list
                    e.target.reset();
                    } catch (err) {
                    setError(err.message);
                    } finally {
                    setLoading(false);
                    }
                }}
                className="stack-form"
                >
                <textarea
                    name="csvtext"
                    rows={5}
                    placeholder="last,first,username,password&#10;Doe,John,john001@lab4,mypass123"
                ></textarea>
                <button type="submit">Import CSV</button>
                </form>
            </section>
        )}
        </section>
    );
}

