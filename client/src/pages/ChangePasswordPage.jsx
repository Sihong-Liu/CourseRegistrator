// client/src/pages/ChangePasswordPage.jsx
import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function ChangePasswordPage() {
	const { changePassword } = useAuth();
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [msg, setMsg] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e) {
		e.preventDefault();
		setMsg('');
		setError('');

		if (newPassword !== confirm) {
			setError('New password and confirmation do not match.');
			return;
		}

		setLoading(true);
		try {
			const res = await changePassword(currentPassword, newPassword);
			setMsg(res.message || 'Password changed. Please login again.');
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="card">
			<div className="field">
				<label>Current password</label>
				<input
					type="password"
					required
					value={currentPassword}
					onChange={e => setCurrentPassword(e.target.value)}
				/>
			</div>

			<div className="field">
				<label>New password</label>
				<input
					type="password"
					required
					minLength={6}
					maxLength={100}
					value={newPassword}
					onChange={e => setNewPassword(e.target.value)}
				/>
			</div>

			<div className="field">
				<label>Confirm new password</label>
				<input
					type="password"
					required
					value={confirm}
					onChange={e => setConfirm(e.target.value)}
				/>
			</div>

			<button type="submit" disabled={loading}>
				{loading ? 'Updating…' : 'Change Password'}
			</button>

			{error && <p className="error">{error}</p>}
			{msg && !error && <p className="success">{msg}</p>}
		</form>
	);
}
