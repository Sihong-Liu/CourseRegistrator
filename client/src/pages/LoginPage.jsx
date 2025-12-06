// client/src/pages/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function LoginPage() {
  	const { login, loading, error } = useAuth();
  	const [username, setUsername] = useState('');
  	const [password, setPassword] = useState('');
  	const [msg, setMsg] = useState('');

	async function handleSubmit(e) {
		e.preventDefault();
		setMsg('');
		try {
		const result = await login(username.trim(), password);
		if (result.firstLogin) {
			setMsg('Login successful. Please change your password (first login).');
		} else {
			setMsg('Login successful.');
		}
		} catch (err) {
		setMsg(err.message);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="card">
		<div className="field">
			<label>Username / Email</label>
			<input
			type="text"
			required
			value={username}
			onChange={e => setUsername(e.target.value)}
			placeholder="e.g. student001@lab4"
			/>
		</div>

		<div className="field">
			<label>Password</label>
			<input
			type="password"
			required
			value={password}
			onChange={e => setPassword(e.target.value)}
			/>
		</div>

		<button type="submit" disabled={loading}>
			{loading ? 'Logging in…' : 'Login'}
		</button>

		{error && <p className="error">{error}</p>}
		{msg && !error && <p className="success">{msg}</p>}
		</form>
	);
}
