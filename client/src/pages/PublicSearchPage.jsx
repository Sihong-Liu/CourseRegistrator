// client/src/pages/PublicSearchPage.jsx
import { useEffect, useState } from 'react';
import { api } from '../api';
export default function PublicSearchPage() {
const [q, setQ] = useState('');
const [results, setResults] = useState([]);
const [expanded, setExpanded] = useState(null); // sheetId -> details
const [error, setError] = useState('');
async function doSearch(e) {
	if (e) e.preventDefault();
	setError('');
	try {
		const data = await api(`/api/open/search?q=${encodeURIComponent(q)}`);
		setResults(data);
		setExpanded(null);
	} catch (err) {
		setError(err.message);
	}
}
useEffect(() => {
	// initial load: show all sheets
	doSearch();
	// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
async function toggleSheet(sheetId) {
	if (expanded?.sheetId === sheetId) {
		setExpanded(null);
		return;
	}
	try {
		const detail = await api(`/api/open/sheets/${sheetId}`);
		setExpanded(detail);
	} catch (err) {
		setError(err.message);
	}
}
return (
	<section className="card">
	<h2>Find Signup Sheets</h2>
	<p>
		Search by course code (e.g. &quot;SE 3316&quot;, &quot;3316&quot;, or partial).
	</p>
	<form onSubmit={doSearch} className="search-form">
		<input
		type="text"
		placeholder="Course code..."
		value={q}
		onChange={e => setQ(e.target.value)}
		/>
		<button type="submit">Search</button>
	</form>
	{error && <p className="error">{error}</p>}
	<ul className="sheet-results">
		{results.map(r => (
		<li key={r.sheetId}>
			<div className="sheet-header">
			<div>
				<strong>{r.courseName}</strong> (Term {r.term}, Sec {r.section})
				<br />
				Sheet #{r.sheetId}: {r.title}
			</div>
			<div className="sheet-meta">
				<div>
				Slots: {r.totalSlots} | Spots: {r.availableSpots}/{r.totalSpots}
				</div>
				<button onClick={() => toggleSheet(r.sheetId)}>
				{expanded?.sheetId === r.sheetId ? 'Hide slots' : 'View slots'}
				</button>
			</div>
			</div>
			{expanded?.sheetId === r.sheetId && (
			<div className="sheet-slots">
				{!expanded.slots?.length ? (
				<p>No slots defined for this sheet.</p>
				) : (
				<table>
					<thead>
					<tr>
						<th>Slot ID</th>
						<th>Start</th>
						<th>End</th>
						<th>Capacity</th>
						<th>Signed up</th>
						<th>Available</th>
					</tr>
					</thead>
					<tbody>
					{expanded.slots.map(s => (
						<tr key={s.slotId}>
						<td>{s.slotId}</td>
						<td>{s.startTime || '—'}</td>
						<td>{s.endTime || '—'}</td>
						<td>{s.capacity}</td>
						<td>{s.taken}</td>
						<td>{s.available}</td>
						</tr>
					))}
					</tbody>
				</table>
				)}
			</div>
			)}
		</li>
		))}
	</ul>
	</section>
);
}