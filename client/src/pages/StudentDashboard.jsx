
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext.jsx';


export default function StudentDashboard() {
    const { user } = useAuth();
    const [mySlots, setMySlots] = useState([]);
    const [availableSlots, setAvailableSlots] = useState([]);
    const [memberId, setMemberId] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');

    async function loadData() {
        setError('');
        const id = memberId.trim();

        let my = { slots: [] };
        if (id) {
            my = await api(
            `/api/secure/my-slots?memberId=${encodeURIComponent(id)}`
            );
        }

        const avail = await api('/api/secure/available-slots');
        setMySlots(my.slots || []);
        setAvailableSlots(avail.slots || []);
    }


    useEffect(() => {
        loadData();
    }, []);

    function fmtDate(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleString();
    }

    async function handleSignup(slotId) {
        setMsg('');
        setError('');

        if (!memberId.trim()) {
        setError('Please enter your member ID before signing up.');
        return;
        }

        setLoading(true);
        try {
        await api(`/api/slots/${slotId}/signup`, {
            method: 'POST',
            body: JSON.stringify({ memberId: memberId.trim() })
        });
        setMsg(`Signed up for slot ${slotId}.`);
        await loadData();
        } catch (e) {
        setError(e.message);
        } finally {
        setLoading(false);
        }
    }

    async function handleLeave(slot) {
        setMsg('');
        setError('');
        setLoading(true);
        try {
        await api(
            `/api/secure/sheets/${slot.sheetId}/slots/${slot.slotId}/leave`,
            { method: 'POST' }
        );
        setMsg('Left the slot successfully.');
        await loadData();
        } catch (e) {
        setError(e.message);
        } finally {
        setLoading(false);
        }
    }

    return (
        <section className="card">
        <h2>Student Dashboard</h2>
        <p>Logged in as {user?.username}</p>

        <div className="field">
            <label>Your member ID (from course list)</label>
            <input
            type="text"
            value={memberId}
            onChange={e => setMemberId(e.target.value)}
            placeholder="e.g. 10020001"
            />
        </div>

        {error && <p className="error">{error}</p>}
        {msg && !error && <p className="success">{msg}</p>}
        {loading && <p>Working...</p>}

        <div className="student-panels">
            <div className="card inner">
            <h3>My Slots</h3>
            {!mySlots.length ? (
                <p>You are not signed up for any slots.</p>
            ) : (
                <table>
                <thead>
                    <tr>
                    <th>Course</th>
                    <th>Assignment</th>
                    <th>Start</th>
                    <th>Members</th>
                    <th>Grade</th>
                    <th>Comment</th>
                    <th>Leave</th>
                    </tr>
                </thead>
                <tbody>
                    {mySlots.map(s => (
                    <tr key={s.slotId}>
                        <td>{s.courseKey}</td>
                        <td>{s.assignmentName}</td>
                        <td>{fmtDate(s.start)}</td>
                        <td>
                        {s.memberCount}/{s.maxMembers}
                        </td>
                        <td>{s.grade ?? '—'}</td>
                        <td>{s.comment || '—'}</td>
                        <td>
                        <button
                            type="button"
                            onClick={() => handleLeave(s)}
                            disabled={loading}
                        >
                            Leave
                        </button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            )}
            </div>

            <div className="card inner">
            <h3>Available Slots</h3>
            {!availableSlots.length ? (
                <p>No slots currently available.</p>
            ) : (
                <table>
                <thead>
                    <tr>
                    <th>Course</th>
                    <th>Assignment</th>
                    <th>Start</th>
                    <th>Members</th>
                    <th>Sign up</th>
                    </tr>
                </thead>
                <tbody>
                    {availableSlots.map(s => (
                    <tr key={s.slotId}>
                        <td>{s.courseKey}</td>
                        <td>{s.assignmentName}</td>
                        <td>{fmtDate(s.start)}</td>
                        <td>
                        {s.memberCount}/{s.maxMembers}
                        </td>
                        <td>
                        <button
                            type="button"
                            onClick={() => handleSignup(s.slotId)}
                            disabled={loading}
                        >
                            Sign up
                        </button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            )}
            </div>
        </div>
        </section>
    );
}
