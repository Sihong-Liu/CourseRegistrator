const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const app = express();
// JWT setup in lab4
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-change-me';
const JWT_EXPIRES_IN = '1h';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json());


// Health check endpoint
app.get('/api/health', (_req, res) => {
  	res.json({ ok: true });
});

// Helper functions
async function ensureDB() {//ensure data directory and file exist
	await fs.mkdir(DATA_DIR, { recursive: true });//make sure data directory exists
	try {
		await fs.access(DATA_FILE);//check exsistence of data file
	} 
	catch {//if file does not exist, create it with initial structure below
		const initial = {
		courses: {},         // key: `${term}-${section}` -> { term, section, courseName, members: { [memberId]: {...} } }
		// it's a placeholders for later phases (sign-up sheets, slots, grades)
		nextSheetId: 1,   //sheetID
		nextSlotId: 1,    //slotID
		signupSheets: {},    // list of sheetIds -> { sheetId, term, section, slots: [slotId], members: { [memberId]: {...} } }
		slots: {},           // by id
		grades: {}           // key: `${memberId}:${sheetId}` -> { grade, comment }
		};
		await fs.writeFile(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');// write initial structure to file in formatted JSON
	}
}

async function loadDB() {//read and parse the database JSON file
	const raw = await fs.readFile(DATA_FILE, 'utf8');//raw because it needs parsing
	const db =  JSON.parse(raw);

	if (!db.users) db.users = {};//these two are for lab4 user management
	if (!db.gradeAudit) db.gradeAudit = {};//they add new sections to db if not exist

	return db;//return parsed object
}

async function saveDB(db) {//save function
  	await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');//save to directory
}

// Input Validation
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));//that sets rule of n being between lo and hi

function toIntInRange(val, min, max, def) {
	const n = Number.parseInt(val, 10);
	if (Number.isFinite(n) && n >= min && n <= max) return n;
	return def;
}

//trim and cut
function sanitizeText(input, maxLen) {
	let s = (typeof input === 'string' ? input : '').trim();//if input not string, replace with empty string. also trim whitespace in both ends
	if (s.length > maxLen) s = s.slice(0, maxLen);//cut to max length if too long
	return s;
}

function courseKey(term, section) {
  return `${term}-${section}`;//it's a key generator for courses stored in db.json, like identifier
}

async function getUserByUsername(username) {
	await ensureDB();
	const db = await loadDB();
	const key = String(username || '').toLowerCase();
	if(!key) return null;
	return db.users[key]||null;
}
async function saveUser(user){
	await ensureDB();
	const db = await loadDB();
	const key = String(user.username||'').trim().toLowerCase();
	if(!key) throw new Error('Invalid username');//if there's no such a username in db

	db.users[key] = {
		username:key,
		passwordHash: user.passwordHash,
		role: user.role || 'student',
		firstLogin: user.firstLogin ?? true
	};
	await saveDB(db);//save the updated db
}

// Update an existing user in DB
async function updateUser(username, updates) {
	await ensureDB();
	const db = await loadDB();

	const key = String(username || '').trim().toLowerCase();
	if (!key || !db.users[key]) throw new Error('User not found');

	const user = db.users[key];

	// apply partial updates
	if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;
	if (updates.role !== undefined) user.role = updates.role;
	if (updates.firstLogin !== undefined) user.firstLogin = updates.firstLogin;

	db.users[key] = user;
	await saveDB(db);

	return user;
}



//JWT authentication middleware
function authRequired(allowedRoles=[]) {
	return function (req, res, next) {
		const authHeader = req.headers.authorization ||'';
		const parts = authHeader.split(' ');
		if (parts.length !==2 || parts[0]!=='Bearer') {
			return res.status(401).json({error:'Missing/invalid Authorization header.'});

		}
		try{
			const token = parts[1];
			const payload = jwt.verify(token, JWT_SECRET);//verify token
			req.user = payload;

			if (allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
				return res.status(403).json({ error: 'Forbidden: require higher permissions level' });
			}
			next();//proceed to next middleware/handler
		}catch (err) {
			console.error('JWT verification failed:', err.message);
			return res.status(401).json({ error: 'Invalid or expired token' });
		}
	};
}

// Blocks normal operations if user hasn't changed their initial password yet
function blockIfFirstLogin(req, res, next) {
	if (req.user && req.user.firstLogin) {
		return res.status(403).json({
		error: 'Password change required on first login.',
		code: 'PASSWORD_CHANGE_REQUIRED'
		});
	}
	next();
}

function isCurrentSlot(slot) {//
	if (!slot || !slot.start || !slot.slotDuration) return false;
	const now = Date.now();
	const start = new Date(slot.start).getTime();
	const durationMs = slot.slotDuration * 60 * 1000;

	return now >= start && now < start + durationMs;
}




// AUTHENTICATION ROUTES
// Post /api/auth/login newly added for Lab4. Body: { username: string, password: string }
app.post('/api/auth/login', async (req, res) => {
	try {
		const { username, password } = req.body || {};
		if (!username || !password) {
			return res.status(400).json({ error: 'Username and password are required.' });
		}

		const user = await getUserByUsername(username);
		if (!user) {
			return res.status(401).json({ error: 'Login failed. Check credentials.' });
		}

		const ok = await bcrypt.compare(password, user.passwordHash);//comepare text and hash
		if (!ok) {//so this is for wrong password
			return res.status(401).json({ error: 'Login failed. Check credentials.' });
		}

		const payload = {
			userId: user.username,          //used as ID
			username: user.username,
			role: user.role || 'student',   //3 roles in total:'student' | 'ta' | 'admin'
			firstLogin: !!user.firstLogin
		};

		const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

		res.json({
			token,
			role: payload.role,
			firstLogin: payload.firstLogin
		});
	} catch (err) {
		console.error('Error in /api/auth/login:', err);
		res.status(500).json({ error: 'Internal server error during login.' });
	}
});

// POST /api/auth/change-password; Body: { currentPassword, newPassword }
app.post('/api/auth/change-password', authRequired(['student', 'ta', 'admin']), async (req, res) => {
  	try {
  	  	const { currentPassword, newPassword } = req.body || {};

  	  	if (!currentPassword || !newPassword) {
  	  	  	return res.status(400).json({ error: 'Current and new passwords are required.' });
  	  	}

  	  	if (newPassword.length < 6 || newPassword.length > 100) {
  	  	  	return res.status(400).json({ error: 'New password must be between 6 and 100 characters.' });
  	  	}

  	  	const username = req.user.username; //from JWT payload
  	  	const user = await getUserByUsername(username);
  	  	if (!user) {
  	  	  	return res.status(404).json({ error: 'User not found.' });
  	  	}

  	  	const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  	  	if (!ok) {
  	  	  	return res.status(401).json({ error: 'Current password is incorrect.' });
  	  	}

  	  	const newHash = await bcrypt.hash(newPassword, 10);

  	  	await updateUser(username, {
			passwordHash: newHash,
			firstLogin: false
  	  	});

  	  	// front-end should discard old token and send user back to login
  	  	res.json({ success: true, message: 'Password updated successfully. Please log in again.' });
  	} catch (err) {
  	  	console.error('Error in /api/auth/change-password:', err);
  	  	res.status(500).json({ error: 'Internal server error while changing password.' });
  	}
});

// POST /api/admin/reset-password; Body: { username, newPassword }
app.post('/api/admin/reset-password', authRequired(['admin']), blockIfFirstLogin, async (req, res) => {
  	try {
  	  	const { username, newPassword } = req.body || {};
  	  	if (!username || !newPassword) {
  	  	  	return res.status(400).json({ error: 'Username and newPassword are required.' });
  	  	}
	  
  	  	if (newPassword.length < 6 || newPassword.length > 100) {
  	  	  	return res.status(400).json({ error: 'New password must be between 6 and 100 characters.' });
  	  	}
	  
  	  	const user = await getUserByUsername(username);
  	  	if (!user) {
  	  	  	return res.status(404).json({ error: 'User not found.' });
  	  	}
	  
  	  	const hash = await bcrypt.hash(newPassword, 10);
	  
  	  	await updateUser(username, {
			passwordHash: hash,
			firstLogin: true  // force mandatory password change on next login
  	  	});
	  
  	  	res.json({ success: true, message: 'Password reset successfully. User must change password at next login.' });
  	} 	catch (err) {
  	  	console.error('Error in /api/admin/reset-password:', err);
  	  	res.status(500).json({ error: 'Internal server error while resetting password.' });
  	}
});

// PUBLIC search for signup sheets (no auth)

/*GET /api/open/search?q=...
Case-insensitive partial match on courseName, sheet title, term, section
Returns summary info + slot counts*/
app.get('/api/open/search', async (req, res) => {
	try {
		await ensureDB();
		const db = await loadDB();

		const q = (req.query.q || '').toString().trim().toLowerCase();

		const sheets = Object.values(db.signupSheets || {});
		const results = [];

		for (const sheet of sheets) {
			const term = sheet.term;
			const section = sheet.section;
			const sheetId = sheet.sheetId;

			const courseKeyStr = courseKey(term, section);
			const course = db.courses[courseKeyStr];

			const courseName = course ? course.courseName : '(Unknown course)';

			// Build searchable string
			const haystack = [
				courseName,
				sheet.title,
				String(term),
				String(section)
			].join(' ').toLowerCase();

			if (q && !haystack.includes(q)) {
				continue; // filter by query
			}

			const slotIds = sheet.slots || [];
			let totalSlots = 0;
			let totalSpots = 0;
			let totalAvailableSpots = 0;

			for (const slotId of slotIds) {
				const slot = db.slots[slotId];
				if (!slot) continue;

				totalSlots++;

				const capacity = slot.capacity ?? slot.maxMembers ?? 0;
				const signups = slot.signups || [];
				const members = slot.members || [];
				const used = Math.max(signups.length, members.length);

				totalSpots += capacity;
				totalAvailableSpots += Math.max(capacity - used, 0);
			}

			results.push({
				sheetId,
				title: sheet.title,
				term,
				section,
				courseName,
				openTime: sheet.openTime || null,
				closeTime: sheet.closeTime || null,
				totalSlots,
				totalSpots,
				availableSpots: totalAvailableSpots
			});
		}

		// If q is empty, we just return all sheets
		res.json(results);
	} catch (err) {
		console.error('Error in /api/open/search:', err);
		res.status(500).json({ error: 'Internal server error during open search.' });
	}
});

// PUBLIC: get details of a single signup sheet + its slots
// GET /api/open/sheets/:sheetId
app.get('/api/open/sheets/:sheetId', async (req, res) => {
	try {
		await ensureDB();
		const db = await loadDB();

		const sheetId = parseInt(req.params.sheetId, 10);
		if (Number.isNaN(sheetId)) {
			return res.status(400).json({ error: 'Invalid sheetId.' });
		}

		const sheet = db.signupSheets[sheetId];
		if (!sheet) {
			return res.status(404).json({ error: 'Signup sheet not found.' });
		}

		const term = sheet.term;
		const section = sheet.section;
		const course = db.courses[courseKey(term, section)];
		const courseName = course ? course.courseName : '(Unknown course)';

		const slotIds = sheet.slots || [];
		const slotsOut = [];

		for (const slotId of slotIds) {
			const slot = db.slots[slotId];
			if (!slot) continue;

			const capacity = slot.capacity ?? slot.maxMembers ?? 0;
			const signups = slot.signups || [];
			const members = slot.members || [];
			const used = Math.max(signups.length, members.length);

			slotsOut.push({
				slotId,
				startTime: slot.startTime || slot.start || null,
				endTime: slot.endTime || null,
				capacity,
				taken: used,
				available: Math.max(capacity - used, 0)
			});
		}

		res.json({
			sheetId,
			title: sheet.title,
			term,
			section,
			courseName,
			openTime: sheet.openTime || null,
			closeTime: sheet.closeTime || null,
			slots: slotsOut
		});
	} catch (err) {
		console.error('Error in /api/open/sheets/:sheetId:', err);
		res.status(500).json({ error: 'Internal server error getting open sheet.' });
	}
});



// COURSES

// GET list of courses
app.get('/api/courses', async (_req, res) => {
	await ensureDB();//call this function to veryify data directory and file exist
	const db = await loadDB();//load and parse db
	const list = Object.values(db.courses).map(c => ({
		term: c.term,
		section: c.section,
		courseName: c.courseName,
		memberCount: Object.keys(c.members).length
	}));
	res.json(list);
});

// POST create a course
// Body: { term (1..9999), courseName (<=100), section (1..99, default 1) }
// Error if (term,section) exists.
app.post('/api/courses',authRequired(['ta','admin'])/*now this endpoint is only for TA and Admin*/,blockIfFirstLogin, async (req, res) => {
	await ensureDB();
	const db = await loadDB();

	const term = toIntInRange(req.body?.term, 1, 9999, 0);
	const section = toIntInRange(req.body?.section ?? 1, 1, 99, 1);
	const courseName = sanitizeText(req.body?.courseName, 100);
	//these ifs are for input qualification
	if (!term) {
		return res.status(400).json({ error: "Missing or invalid 'term' (1–9999)." });//return 400 error with hint
	}
	if (!courseName) {
		return res.status(400).json({ error: "Missing or invalid 'courseName' (text, max 100 chars)." });
	}

	const key = courseKey(term, section);
	if (db.courses[key]) {
		return res.status(409).json({ error: `Course ${term} section ${section} already exists.` });
	}

	db.courses[key] = { term, section, courseName, members: [] };
	await saveDB(db);

	res.status(201).json({ term, section, courseName, members: [] });
});

// UPDATE a course
// Lab 4 rules:TA or admin only, If course has signup sheets, only courseName can be changed.
// the new (term, section) must not conflict with an existing course.
app.put('/api/courses/:term/:section',
	authRequired(['ta','admin']),
	blockIfFirstLogin,
	async (req, res) => {
		try {
		await ensureDB();
		const db = await loadDB();

		// Old identity from URL
		const oldTerm = parseInt(req.params.term, 10);
		const oldSection = parseInt(req.params.section, 10);

		if (Number.isNaN(oldTerm) || Number.isNaN(oldSection)) {
			return res.status(400).json({ error: 'Invalid term or section in URL.' });
		}

		const oldKey = courseKey(oldTerm, oldSection);
		const course = db.courses[oldKey];

		if (!course) {
			return res.status(404).json({ error: 'Course not found.' });
		}

		// Body values
		const body = req.body || {};

		const newTerm = body.term !== undefined
			? parseInt(body.term, 10)
			: oldTerm;

		const newSection = body.section !== undefined
			? parseInt(body.section, 10)
			: oldSection;

		const newCourseName = sanitizeText(
			body.courseName !== undefined ? body.courseName : course.courseName,
			100
		);

		if (!newCourseName) {
			return res.status(400).json({ error: 'courseName is required.' });
		}

		// Determine if this course is associated with any signup sheets
		// scan all signupSheets and look for matching term + section
		const sheetsForCourse = Object.values(db.signupSheets || {}).filter(sheet =>
			sheet.term === course.term && sheet.section === course.section
		);
		const hasSheets = sheetsForCourse.length > 0;

		// If course has signup sheets, term & section CANNOT change
		if (hasSheets && (newTerm !== oldTerm || newSection !== oldSection)) {
			return res.status(400).json({
			error: 'Cannot change term or section for a course that has signup sheets.'
			});
		}


		// If term/section changed (allowed only when no sheets), check duplicates
		const newKey = courseKey(newTerm, newSection);
		if (newKey !== oldKey && db.courses[newKey]) {
			return res.status(409).json({
			error: `Course with term ${newTerm} and section ${newSection} already exists.`
			});
		}

		// Apply updates
		if (newKey === oldKey) {
			// No key change → update in place
			course.term = newTerm;
			course.section = newSection;
			course.courseName = newCourseName;
		} else {
			// Key changed and no conflict, and course has no sheets
			const updatedCourse = {
			...course,
			term: newTerm,
			section: newSection,
			courseName: newCourseName
			};

			db.courses[newKey] = updatedCourse;
			delete db.courses[oldKey];
		}

		await saveDB(db);

		const updated = db.courses[newKey] || db.courses[oldKey];
		res.json(updated);

		} catch (err) {
		console.error('Error updating course:', err);
		res.status(500).json({ error: 'Internal server error while updating course.' });
		}
	}
);


// DELETE a course and all its related sheets/slots/grades
app.delete('/api/courses/:term/:section',
	authRequired(['ta','admin']),
	blockIfFirstLogin,
	async (req, res) => {
		try {
			await ensureDB();
			const db = await loadDB();

			const term = parseInt(req.params.term, 10);
			const section = parseInt(req.params.section, 10);
			if (Number.isNaN(term) || Number.isNaN(section)) {
				return res.status(400).json({ error: 'Invalid term or section.' });
			}

			const key = courseKey(term, section);
			const course = db.courses[key];

			if (!course) {
				return res.status(404).json({ error: 'Course not found.' });
			}

			// Find any signup sheets for this course
			const sheetsForCourse = Object.values(db.signupSheets || {}).filter(sheet =>
				sheet.term === course.term && sheet.section === course.section
			);

			if (sheetsForCourse.length > 0) {//cannot delete course if it has signup sheets
				return res.status(400).json({
					error: `Cannot delete course ${key} because it has ${sheetsForCourse.length} signup sheet(s).`
				});
			}

			// if no error Safe to delete course,then delete
			delete db.courses[key];

			await saveDB(db);

			res.json({
				ok: true,
				message: `Course ${key} deleted successfully.`
			});
		} catch (err) {
			console.error('Error deleting course:', err);
			res.status(500).json({ error: 'Internal server error while deleting course.' });
		}
	}
);

/*CSV import: create users + course members in bulk
URL: POST /api/admin/courses/:term/:section/import-members
Body (JSON):
{
  "csv": "memberId,firstName,lastName,username,password\n10020001,Jason,Chen,student001@lab4,pass001\n..."
}
Rules per line:
- memberId (int) is required
- firstName, lastName optional (default "")
- username optional (default: memberId as string, e.g. "10020001")
- password optional (default: "P<memberId>!" e.g. "P10020001!")
For each line:
- If user (username) does NOT exist -> create student user with given password
- Add member to course if memberId not already in course.members*/
app.post('/api/admin/courses/:term/:section/import-members',
  authRequired(['admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const term = parseInt(req.params.term, 10);
      const section = parseInt(req.params.section, 10);
      if (Number.isNaN(term) || Number.isNaN(section)) {
        return res.status(400).json({ error: 'Invalid term or section.' });
      }

      const key = courseKey(term, section);
      const course = db.courses[key];
      if (!course) {
        return res.status(404).json({ error: 'Course not found.' });
      }

      const csvText = (req.body && typeof req.body.csv === 'string')
        ? req.body.csv
        : '';

      if (!csvText.trim()) {
        return res.status(400).json({ error: "Body must include a non-empty 'csv' string." });
      }

      // Normalize members array (in case it's legacy object)
      if (!course.members) {
        course.members = [];
      } else if (!Array.isArray(course.members)) {
        const legacy = course.members;
        course.members = Object.values(legacy || {}).map(m => ({
          memberId: parseInt(m.memberId || m.id || '0', 10),
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          username: m.username || null
        })).filter(m => !Number.isNaN(m.memberId) && m.memberId > 0);
      }

      db.users = db.users || {};

      const lines = csvText.split(/\r?\n/);
      let createdUsers = 0;
      let createdMembers = 0;
      const skipped = [];
      const errors = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;          // skip empty lines
        if (line.startsWith('#')) continue; // allow comments

        const cols = line.split(',');
        if (cols.length < 1) {
          errors.push({ line, reason: 'Not enough columns.' });
          continue;
        }

        const memberIdRaw = cols[0].trim();
        const memberId = parseInt(memberIdRaw, 10);
        if (Number.isNaN(memberId) || memberId <= 0) {
          errors.push({ line, reason: 'Invalid memberId (must be positive integer).' });
          continue;
        }

        const firstName = (cols[1] || '').trim();
        const lastName  = (cols[2] || '').trim();
        let username    = (cols[3] || '').trim().toLowerCase();
        let plainPassword = (cols[4] || '').trim();

        if (!username) {
          // default: use memberId string as username
          username = String(memberId);
        }
        if (!plainPassword) {
          // default password if none provided
          plainPassword = `P${memberId}!`;
        }

        // If user doesn't exist, create it
        let user = db.users[username];
        if (!user) {
          const passwordHash = await bcrypt.hash(plainPassword, 10);
          user = {
            username,
            passwordHash,
            role: 'student',
            firstLogin: true
          };
          db.users[username] = user;
          createdUsers++;
        } else if (user.role !== 'student') {
          // Can't link non-student accounts as course members
          errors.push({
            line,
            reason: `User ${username} exists but is not a student (role: ${user.role}).`
          });
          continue;
        }

        // Check if memberId already in course
        const existingMember = course.members.find(m => m.memberId === memberId);
        if (existingMember) {
          skipped.push({ memberId, reason: 'Already a member of this course.' });
          continue;
        }

        // Add course member
        const newMember = {
          memberId,
          firstName,
          lastName,
          username
        };
        course.members.push(newMember);
        createdMembers++;
      }

      await saveDB(db);

      res.json({
        term,
        section,
        courseName: course.courseName,
        createdUsers,
        createdMembers,
        skipped,
        errors
      });
    } catch (err) {
      console.error('Error in CSV import:', err);
      res.status(500).json({ error: 'Internal server error during CSV import.' });
    }
  }
);




// course member section
// ADD a member to a course
/*Body: { memberId, firstName, lastName, username? }
memberId, firstName, lastName are required
username is optional, but if provided, must refer to an existing user*/
// ADD a member to a course
app.post('/api/courses/:term/:section/members',
  authRequired(['ta','admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const term = parseInt(req.params.term, 10);
      const section = parseInt(req.params.section, 10);
      if (Number.isNaN(term) || Number.isNaN(section)) {
        return res.status(400).json({ error: 'Invalid term or section.' });
      }

      const key = courseKey(term, section);
      const course = db.courses[key];
      if (!course) {
        return res.status(404).json({ error: 'Course not found.' });
      }

      const body = req.body || {};
      const rawMemberId = body.memberId;
      const memberId = parseInt(rawMemberId, 10);
      const firstName = sanitizeText(body.firstName, 50);
      const lastName  = sanitizeText(body.lastName, 50);
      const username  = body.username
        ? sanitizeText(body.username, 100).toLowerCase()
        : null;
      if (Number.isNaN(memberId) || memberId <= 0) {
        return res.status(400).json({
          error: 'memberId must be a positive integer.'
        });
      }
      if (!memberId || !firstName || !lastName) {
        return res.status(400).json({
          error: 'memberId, firstName, and lastName are required.'
        });
      }

      //IMPORTANT: normalize course.members here
      if (!course.members) {
        // nothing there yet → start fresh array
        course.members = [];
      } else if (!Array.isArray(course.members)) {
        // OLD object format from Lab3 → convert to array
        const legacy = course.members;
        course.members = Object.values(legacy || {}).map(m => ({
          memberId: m.memberId || m.id || '',
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          username: m.username || null
        }));
      }

      // memberId must be unique within this course
      const existing = course.members.find(m => m.memberId === memberId);
      if (existing) {
        return res.status(409).json({
          error: `Member with memberId ${memberId} already exists in this course.`
        });
      }

      // If username provided, ensure user exists and is student
      if (username) {
        const user = db.users && db.users[username];
        if (!user) {
          return res.status(400).json({
            error: `User account ${username} does not exist. Please create the account first.`
          });
        }
        if (user.role !== 'student') {
          return res.status(400).json({
            error: `User ${username} is not a student (role: ${user.role}).`
          });
        }
      }

      const newMember = {
        memberId,
        firstName,
        lastName,
        username: username || null
      };

      course.members.push(newMember);
      await saveDB(db);

      res.status(201).json({
        success: true,
        member: newMember
      });
    } catch (err) {
      console.error('Error adding course member:', err);
      res.status(500).json({ error: 'Internal server error while adding course member.' });
    }
  }
);



// GET list members
app.get('/api/courses/:term/:section/members',
  authRequired(['ta','admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
		await ensureDB();
		const db = await loadDB();

		const term = parseInt(req.params.term, 10);
		const section = parseInt(req.params.section, 10);
		if (Number.isNaN(term) || Number.isNaN(section)) {
			return res.status(400).json({ error: 'Invalid term or section.' });
		}

		const key = courseKey(term, section);
		const course = db.courses[key];
		if (!course) return res.status(404).json({ error: 'Course not found.' });

		if (!course.members) {
		course.members = [];
		} else if (!Array.isArray(course.members)) {
		const legacy = course.members;
		course.members = Object.values(legacy || {}).map(m => ({
			memberId: parseInt(m.memberId || m.id || '0', 10),
			firstName: m.firstName || '',
			lastName: m.lastName || '',
			username: m.username || null
		})).filter(m => !Number.isNaN(m.memberId) && m.memberId > 0);
		}

		res.json({
			term: course.term,
			section: course.section,
			courseName: course.courseName,
			members: course.members
		});
    } catch (err) {
      console.error('Error getting course members:', err);
      res.status(500).json({ error: 'Internal server error while getting course members.' });
    }
  }
);


// DELETE a member from a course
// - Fails if the member has any signups in any slot for this course.
app.delete('/api/courses/:term/:section/members/:memberId',
  authRequired(['ta','admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const term = parseInt(req.params.term, 10);
      const section = parseInt(req.params.section, 10);
      if (Number.isNaN(term) || Number.isNaN(section)) {
        return res.status(400).json({ error: 'Invalid term or section.' });
      }

      const key = courseKey(term, section);
      const course = db.courses[key];
      if (!course) {
        return res.status(404).json({ error: 'Course not found.' });
      }

      const memberId = parseInt(req.params.memberId, 10);
      if (Number.isNaN(memberId)) {
        return res.status(400).json({ error: 'Invalid memberId. Must be integer.' });
      }
      course.members = course.members || [];

      const exists = course.members.some(m => m.memberId === memberId);
      if (!exists) {
        return res.status(404).json({
          error: `Member ${memberId} not found in this course.`
        });
      }

      // Check signups in all signup sheets for this course
      const sheetsForCourse = Object.values(db.signupSheets || {}).filter(sheet =>
        sheet.term === course.term && sheet.section === course.section
      );

      let signupCount = 0;
      for (const sheet of sheetsForCourse) {
        const slotIds = sheet.slots || [];
        for (const slotId of slotIds) {
          const slot = db.slots[slotId];
          if (!slot) continue;

          slot.signups = slot.signups || [];
          slot.members = slot.members || [];

          if (slot.signups.includes(memberId) || slot.members.includes(memberId)) {
            signupCount++;
          }
        }
      }

      if (signupCount > 0) {
        return res.status(400).json({
          error: `Cannot delete member ${memberId} because they have ${signupCount} signup(s) in this course.`
        });
      }

      // Safe to remove from course.members
      course.members = course.members.filter(m => m.memberId !== memberId);
      await saveDB(db);

      res.json({
        ok: true,
        message: `Member ${memberId} removed from course ${key}.`
      });
    } catch (err) {
      console.error('Error deleting course member:', err);
      res.status(500).json({ error: 'Internal server error while deleting course member.' });
    }
  }
);


// Sign up sheet section
// POST create a new sheet
// Body: { "title": "...", "openTime": "ISO-8601", "closeTime": "ISO-8601" }
app.post('/api/courses/:term/:section/sheets',authRequired(['ta','admin'])/*now this endpoint is only for TA and Admin*/, blockIfFirstLogin, async (req, res) => {
  await ensureDB();
  const db = await loadDB();

  const term = toIntInRange(req.params.term, 1, 9999, 0);
  const section = toIntInRange(req.params.section, 1, 99, 1);
  if (!term) return res.status(400).json({ error: "Invalid 'term'." });

  const key = courseKey(term, section);
  const course = db.courses[key];
  if (!course) return res.status(404).json({ error: `Course ${term} sec ${section} not found.` });

  const title = sanitizeText(req.body?.title, 200);
  const openTime = sanitizeText(req.body?.openTime, 50);
  const closeTime = sanitizeText(req.body?.closeTime, 50);

  if (!title) return res.status(400).json({ error: "Missing or invalid 'title'." });

  const id = db.nextSheetId++;
  db.signupSheets[id] = { sheetId: id, term, section, title, openTime, closeTime, slots: [] };
  await saveDB(db);

  res.status(201).json(db.signupSheets[id]);
});

// GET list all sheets for a course
app.get('/api/courses/:term/:section/sheets', async (req, res) => {
  await ensureDB();
  const db = await loadDB();

  const term = toIntInRange(req.params.term, 1, 9999, 0);
  const section = toIntInRange(req.params.section, 1, 99, 1);
  if (!term) return res.status(400).json({ error: "Invalid 'term'." });

  const sheets = Object.values(db.signupSheets)
    .filter(s => s.term === term && s.section === section);

  res.json(sheets);
});

// DELETE a sheet
app.delete('/api/courses/:term/:section/sheets/:sheetId',authRequired(['ta','admin'])/*now this endpoint is only for TA and Admin*/, blockIfFirstLogin, async (req, res) => {
  try {
      await ensureDB();
      const db = await loadDB();

      const sheetId = parseInt(req.params.sheetId, 10);
      if (Number.isNaN(sheetId)) {
        return res.status(400).json({ error: 'Invalid signup sheet ID.' });
      }

      const sheet = db.signupSheets[sheetId];
      if (!sheet) {
        return res.status(404).json({ error: `Signup sheet ${sheetId} not found.` });
      }

      // Check all slots belonging to this sheet
      const slotsWithSignups = [];
      for (const slotId of sheet.slots || []) {
        const slot = db.slots[slotId];
        if (!slot) continue;

        slot.signups = slot.signups || [];
        slot.members = slot.members || [];

        const signupCount = Math.max(slot.signups.length, slot.members.length);
        if (signupCount > 0) {
          slotsWithSignups.push({ slotId, signupCount });
        }
      }

      // Lab 4 rule: cannot delete sheet if any slot has signups
      if (slotsWithSignups.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete signup sheet because some slots have signups.',
          slots: slotsWithSignups
        });
      }

      // If we reach here, it's safe to delete the sheet and its empty slots
      for (const slotId of sheet.slots || []) {
        delete db.slots[slotId];
      }
      delete db.signupSheets[sheetId];

      await saveDB(db);

      res.json({
        ok: true,
        message: `Signup sheet ${sheetId} and its empty slots were deleted.`
      });
    } catch (err) {
      console.error('Error deleting signup sheet:', err);
      res.status(500).json({ error: 'Internal server error while deleting signup sheet.' });
    }
  }
);


// SLOT SECTION

// POST create a slot for a sheet
// Body: { startTime, endTime, capacity }
app.post('/api/sheets/:sheetId/slots', authRequired(['ta', 'admin']), blockIfFirstLogin, async (req, res) => {
    try {
        await ensureDB();
        const db = await loadDB();

        const sheetId = parseInt(req.params.sheetId, 10);
        const sheet = db.signupSheets[sheetId];
        if (!sheet) {
            return res.status(404).json({ error: "Sheet not found." });
        }

        const startTime = sanitizeText(req.body?.startTime, 50);
        const endTime   = sanitizeText(req.body?.endTime, 50);
        const capacity  = toIntInRange(req.body?.capacity, 1, 999, 1);

        if (!startTime || !endTime) {
            return res.status(400).json({ error: "startTime and endTime are required." });
        }

        // Compute duration in minutes
        const durationMinutes = Math.max(
            1,
            Math.round((new Date(endTime) - new Date(startTime)) / (60 * 1000))
        );

        const id = db.nextSlotId++;

        const slot = {
            slotId: id,
            sheetId,

            // Lab 3 fields
            startTime,
            endTime,
            capacity,
            signups: [],

            // Lab 4 fields (needed for grading + student view)
            start: startTime,
            slotDuration: durationMinutes,
            maxMembers: capacity,
            members: []
        };

        sheet.slots.push(id);
        db.slots[id] = slot;

        await saveDB(db);
        res.status(201).json(slot);

    } catch (err) {
        console.error("Error creating slot:", err);
        res.status(500).json({ error: "Internal server error creating slot." });
    }
});


// GET list all slots for a sheet
app.get('/api/sheets/:sheetId/slots', async (req, res) => {
  await ensureDB();
  const db = await loadDB();

  const sheetId = parseInt(req.params.sheetId, 10);
  const sheet = db.signupSheets[sheetId];
  if (!sheet) return res.status(404).json({ error: `Sheet ${sheetId} not found.` });

  const slots = sheet.slots.map(id => db.slots[id]).filter(Boolean);
  res.json(slots);
});

// DELETE a slot
app.delete('/api/sheets/:sheetId/slots/:slotId', authRequired(['ta','admin'])/*now this endpoint is only for TA and Admin*/, blockIfFirstLogin,async (req, res) => {
  try {
      await ensureDB();
      const db = await loadDB();

      const slotId = parseInt(req.params.slotId, 10);
      if (Number.isNaN(slotId)) {
        return res.status(400).json({ error: 'Invalid slot ID.' });
      }

      const slot = db.slots[slotId];
      if (!slot) {
        return res.status(404).json({ error: `Slot ${slotId} not found.` });
      }

      // make sure arrays exist
      slot.signups = slot.signups || [];
      slot.members = slot.members || [];

      // Lab 4 rule: cannot delete if there are any signups
      const signupCount = Math.max(slot.signups.length, slot.members.length);
      if (signupCount > 0) {
        return res.status(400).json({
          error: `Cannot delete slot ${slotId} because it has ${signupCount} signup(s).`
        });
      }

      // Remove this slot from its parent sheet.slots[]
      const sheet = db.signupSheets[slot.sheetId];
      if (sheet && Array.isArray(sheet.slots)) {
        sheet.slots = sheet.slots.filter(id => id !== slotId);
      }

      // Now safe to delete
      delete db.slots[slotId];

      await saveDB(db);
      res.json({
        ok: true,
        message: `Slot ${slotId} deleted successfully.`
      });
    } catch (err) {
      console.error('Error deleting slot:', err);
      res.status(500).json({ error: 'Internal server error while deleting slot.' });
    }
});

// UPDATE a slot in a sheet(TA/admin)).
/*Rules:Cannot reduce capacity below existing signups.
Cannot move/resize into a time that overlaps another slot in the same sheet.
Must stay within sheet openTime/closeTime if defined.*/
app.put('/api/sheets/:sheetId/slots/:slotId',
  	authRequired(['ta','admin']),
  	blockIfFirstLogin,
  	async (req, res) => {
    	try {
    	  	await ensureDB();
    	  	const db = await loadDB();
			
    	  	const sheetId = parseInt(req.params.sheetId, 10);
    	  	const slotId  = parseInt(req.params.slotId, 10);
			
    	  	if (Number.isNaN(sheetId) || Number.isNaN(slotId)) {
    	  	  return res.status(400).json({ error: 'Invalid sheetId or slotId.' });
    	  	}
		  
    	  	const sheet = db.signupSheets[sheetId];
    	  	if (!sheet) {
    	  	  return res.status(404).json({ error: `Signup sheet ${sheetId} not found.` });
    	  	}
		  
    	  	const slot = db.slots[slotId];
    	  		if (!slot || Number(slot.sheetId) !== sheetId) {
				return res.status(404).json({
					error: `Slot ${slotId} not found for sheet ${sheetId}`
				});
				}
			
    	  	const body = req.body || {};
			
    	  	// Old values
    	  	const oldStart = new Date(slot.start || slot.startTime);
    	  	const oldEnd   = new Date(slot.endTime || (slot.start && slot.slotDuration
    	  	                     ? new Date(slot.start).getTime() + slot.slotDuration * 60000
    	  	                     : slot.endTime));
			
    	  	const oldCapacity = slot.capacity ?? slot.maxMembers ?? 0;
			
    	  	// New values (fallback to old if not provided)
    	  	const newStartTimeStr = body.startTime ?? slot.startTime ?? slot.start;
    	  	const newEndTimeStr   = body.endTime   ?? slot.endTime;
    	  	const newCapacityRaw  = body.capacity  ?? oldCapacity;
			
    	  	const newCapacity = parseInt(newCapacityRaw, 10);
    	  	if (Number.isNaN(newCapacity) || newCapacity <= 0) {
    	  	  	return res.status(400).json({ error: 'capacity must be a positive integer.' });
    	  	}
		  
    	  	const newStart = new Date(newStartTimeStr);
    	  	const newEnd   = new Date(newEndTimeStr);
		  
    	  	if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
    	  	  	return res.status(400).json({ error: 'Invalid startTime or endTime.' });
    	  	}
    	  	if (newEnd <= newStart) {
    	  	  	return res.status(400).json({ error: 'endTime must be after startTime.' });
    	  	}
		  
    	  	// Ensure arrays exist
    	  	slot.signups = slot.signups || [];
    	  	slot.members = slot.members || [];
		  
    	  	const existingSignupsCount = Math.max(slot.signups.length, slot.members.length);
		  
    	  	// Rule: cannot shrink capacity below existing signups
    	  	if (newCapacity < existingSignupsCount) {
    	  	  	return res.status(400).json({
    	  	    	error: `Cannot set capacity (${newCapacity}) below existing signups (${existingSignupsCount}).`
    	  	  	});
    	  	}
		  
    	  	// Optional rule: keep within sheet open/close times if defined
    	  	if (sheet.openTime) {
    	  	  	const open = new Date(sheet.openTime);
    	  	  	if (!Number.isNaN(open.getTime()) && newStart < open) {
    	  	    	return res.status(400).json({ error: 'Slot startTime cannot be before sheet openTime.' });
    	  	  		}
    	  	}
    	  	if (sheet.closeTime) {
    	  	  	const close = new Date(sheet.closeTime);
    	  	  	if (!Number.isNaN(close.getTime()) && newEnd > close) {
    	  	   		return res.status(400).json({ error: 'Slot endTime cannot be after sheet closeTime.' });
    	  	  }
    	  	}
		  
    	  	// Rule: no overlap with other slots in the SAME sheet
    	  	const slotsInSheet = sheet.slots || [];
    	  	for (const otherId of slotsInSheet) {
    	  	  	if (otherId === slotId) continue;
    	  	  	const other = db.slots[otherId];
    	  	  	if (!other) continue;
			
    	  	  	const otherStart = new Date(other.start || other.startTime);
    	  	  	const otherEnd   = new Date(
    	  	    other.endTime ||
    	  	    (other.start && other.slotDuration
    	  	      ? new Date(other.start).getTime() + other.slotDuration * 60000
    	  	      : other.endTime)
    	  	  );
			
    	  	  if (Number.isNaN(otherStart.getTime()) || Number.isNaN(otherEnd.getTime())) continue;
			
    	  	  const overlap = newStart < otherEnd && otherStart < newEnd;
    	  	  if (overlap) {
    	  	    	return res.status(400).json({
    	  	    	  	error: `New time interval overlaps with slot ${otherId}.`
    	  	    	});
    	  	  }
    	  	}
		  
    	  	// All checks passed → apply update
    	  	slot.startTime = newStartTimeStr;
    	  	slot.endTime   = newEndTimeStr;
    	  	slot.capacity  = newCapacity;
		  
    	  	// sync the fields
    	  	slot.start        = newStartTimeStr;
    	  	slot.slotDuration = Math.round((newEnd.getTime() - newStart.getTime()) / 60000);
    	  	slot.maxMembers   = newCapacity;
		  
    	  	db.slots[slotId] = slot;
    	  	await saveDB(db);
		  
    	  	res.json({
    	  	  	slotId,
    	  	  	sheetId,
    	  	  	startTime: slot.startTime,
    	  	  	endTime: slot.endTime,
    	  	  	capacity: slot.capacity,
    	  	  	slotDuration: slot.slotDuration,
    	  	  	maxMembers: slot.maxMembers,
    	  	  	signupsCount: existingSignupsCount
    	  	});
    	} 	catch (err) {
    	  	console.error('Error updating slot:', err);
    	  	res.status(500).json({ error: 'Internal server error while updating slot.' });
    	}
  }
);



// GET user's signed-up slots across all sheets
// GET user's signed-up slots across all sheets
app.get(
	'/api/secure/my-slots',
	authRequired(['student', 'ta', 'admin']),
	blockIfFirstLogin,
	async (req, res) => {
		try {
			await ensureDB();
			const db = await loadDB();

			// Prefer ?memberId= from query (what student typed),
			// fallback to username if none provided.
			const memberId =
				(req.query.memberId && String(req.query.memberId).trim()) ||
				req.user.userId;

			const result = [];

			for (const [slotIdStr, slot] of Object.entries(db.slots)) {
				const slotId = parseInt(slotIdStr, 10);
				if (!slot || !Array.isArray(slot.members)) continue;

				if (!slot.members.includes(memberId)) continue;

				const sheet = db.signupSheets[slot.sheetId];
				if (!sheet) continue;

				const sheetGrades = db.grades[sheet.sheetId] || {};
				const gradeEntry = sheetGrades[memberId] || null;

				result.push({
					slotId,
					sheetId: sheet.sheetId || sheet.id || Number(slot.sheetId),
					assignmentName: sheet.assignmentName,
					courseKey: sheet.courseKey,
					start: slot.start,
					slotDuration: slot.slotDuration,
					maxMembers: slot.maxMembers,
					memberCount: slot.members.length,
					grade: gradeEntry ? gradeEntry.grade : null,
					comment: gradeEntry ? gradeEntry.comment : ''
				});
			}

			res.json({ slots: result });
		} catch (err) {
			console.error('Error in /api/secure/my-slots:', err);
			res.status(500).json({ error: 'Internal server error fetching your slots.' });
		}
	}
);


// Get avail slots.
app.get('/api/secure/available-slots',authRequired(['student', 'ta', 'admin']),blockIfFirstLogin,async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const now = Date.now();
      const oneHourMs = 60 * 60 * 1000;
      const memberId = req.user.userId;

      const result = [];

      for (const [slotIdStr, slot] of Object.entries(db.slots)) {
        const slotId = parseInt(slotIdStr);
        if (!slot) continue;

        const sheet = db.signupSheets[slot.sheetId];
        if (!sheet) continue;

        const startTime = new Date(slot.start).getTime();
        if (Number.isNaN(startTime)) continue;

        // skip slots within 1 hour
        if (startTime - now < oneHourMs) continue;

        slot.members = slot.members || [];
        if (slot.members.length >= slot.maxMembers) continue;

        // you may also skip if user already signed up for *this* sheet or slot, as you like
        // if (slot.members.includes(memberId)) continue;

        result.push({
          slotId,
          sheetId: sheet.id,
          assignmentName: sheet.assignmentName,
          courseKey: sheet.courseKey,
          start: slot.start,
          slotDuration: slot.slotDuration,
          maxMembers: slot.maxMembers,
          memberCount: slot.members.length
        });
      }

      res.json({ slots: result });
    } catch (err) {
      console.error('Error in /api/secure/available-slots:', err);
      res.status(500).json({ error: 'Internal server error fetching available slots.' });
    }
  }
);



// SIGNUP SECTION

//to POST signup: { "memberId": "XXXXXXXX" }
app.post('/api/slots/:slotId/signup', authRequired(['student','ta','admin'])/*now this endpoint is open to student, ta, and admin*/, blockIfFirstLogin, async (req, res) => {
  try {
    await ensureDB();
    const db = await loadDB();

    const slotId = parseInt(req.params.slotId, 10);
    const slot = db.slots[slotId];
    if (!slot) {
      return res.status(404).json({ error: `Slot ${slotId} not found.` });
    }

    // ensure arrays exist
    slot.signups = slot.signups || [];
    slot.members = slot.members || [];

    // memberId: keep your existing behaviour (body), but you *could* use req.user.userId if you want stricter student behaviour
    let memberId = sanitizeText(req.body?.memberId, 8);
    if (!memberId) {
      return res.status(400).json({ error: "Missing or invalid 'memberId'." });
    }

    // prevent duplicates (check both arrays, just in case)
    if (slot.signups.includes(memberId) || slot.members.includes(memberId)) {
      return res.status(409).json({ error: `Member ${memberId} already signed up.` });
    }

    // enforce capacity (use either capacity or maxMembers)
    const capacity = slot.capacity ?? slot.maxMembers ?? 0;
    const currentCount = Math.max(slot.signups.length, slot.members.length);
    if (capacity && currentCount >= capacity) {
      return res.status(400).json({ error: `Slot ${slotId} is full.` });
    }

    // 1-hour rule (Lab 4): fail if slot starts in < 1 hour
    if (slot.start || slot.startTime) {
      const now = Date.now();
      const startTimeMs = new Date(slot.start || slot.startTime).getTime();
      if (!Number.isNaN(startTimeMs) && startTimeMs - now < 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Cannot sign up less than 1 hour before start time.' });
      }
    }

    //keep both arrays in sync
    slot.signups.push(memberId);
    slot.members.push(memberId);

    await saveDB(db);
    res.status(201).json({
      ok: true,
      message: `Member ${memberId} signed up for slot ${slotId}.`,
      memberCount: slot.members.length
    });
  } catch (err) {
    console.error('Error in POST /api/slots/:slotId/signup:', err);
    res.status(500).json({ error: 'Internal server error during signup.' });
  }
});


// GET list signups for a slot
app.get('/api/slots/:slotId/signups', async (req, res) => {
  await ensureDB();
  const db = await loadDB();

  const slotId = parseInt(req.params.slotId, 10);
  const slot = db.slots[slotId];
  if (!slot) return res.status(404).json({ error: `Slot ${slotId} not found.` });

  res.json(slot.signups);
});

// DELETE a signup (cancel)
app.delete('/api/slots/:slotId/signups/:memberId', authRequired(['ta','admin'])/*now this endpoint is open to ta, and admin*/, blockIfFirstLogin, async (req, res) => {
  try {
    await ensureDB();
    const db = await loadDB();

    const slotId = parseInt(req.params.slotId, 10);
    const memberId = sanitizeText(req.params.memberId, 8);

    const slot = db.slots[slotId];
    if (!slot) {
      return res.status(404).json({ error: `Slot ${slotId} not found.` });
    }

    slot.signups = slot.signups || [];
    slot.members = slot.members || [];

    if (!slot.signups.includes(memberId) && !slot.members.includes(memberId)) {
      return res.status(404).json({ error: `Member ${memberId} not signed up.` });
    }

    // remove from BOTH arrays
    slot.signups = slot.signups.filter(m => m !== memberId);
    slot.members = slot.members.filter(m => m !== memberId);

    await saveDB(db);
    res.json({ ok: true, message: `Removed ${memberId} from slot ${slotId}.` });
  } catch (err) {
    console.error('Error in DELETE /api/slots/:slotId/signups/:memberId:', err);
    res.status(500).json({ error: 'Internal server error while deleting signup.' });
  }
});


// POST /api/secure/sheets/:sheetId/slots/:slotId/leave
//this is for students to leave a slot by themselves, that they can only remove themselves from slots but not others.
app.post(
  '/api/secure/sheets/:sheetId/slots/:slotId/leave',
  authRequired(['student', 'ta', 'admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const sheetId = parseInt(req.params.sheetId);
      const slotId = parseInt(req.params.slotId);

      if (Number.isNaN(sheetId) || Number.isNaN(slotId)) {
        return res.status(400).json({ error: 'Invalid sheet or slot ID.' });
      }

      const slot = db.slots[slotId];
      const sheet = db.signupSheets[sheetId];

      if (!sheet || !slot || slot.sheetId !== sheetId) {
        return res.status(404).json({ error: 'Signup sheet or slot not found.' });
      }

      const memberId = req.user.userId;  // from JWT
      slot.members = slot.members || [];
      slot.signups = slot.signups || [];

      if (!slot.members.includes(memberId) && !slot.signups.includes(memberId)) {
        return res.status(400).json({ error: 'You are not signed up for this slot.' });
      }

      // 2-hour rule
      const now = Date.now();
      const slotStart = new Date(slot.start || slot.startTime).getTime();
      if (!Number.isNaN(slotStart) && slotStart - now < 2 * 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Cannot leave a slot less than 2 hours before start time.' });
      }

      // remove from BOTH arrays
      slot.members = slot.members.filter(m => m !== memberId);
      slot.signups = slot.signups.filter(m => m !== memberId);

      await saveDB(db);

      res.json({
        success: true,
        message: 'Left the slot successfully.',
        slot: {
          slotId,
          memberCount: slot.members.length
        }
      });
    } catch (err) {
      console.error('Error leaving slot:', err);
      res.status(500).json({ error: 'Internal server error while leaving slot.' });
    }
  }
);




// Get members for a given slot
app.get('/api/slots/:slotId/members', async (req, res) => {
  await ensureDB();
  const db = await loadDB();

  const slotId = parseInt(req.params.slotId, 10);
  if (!Number.isInteger(slotId) || slotId <= 0) {
    return res.status(400).json({ error: 'Invalid slotId' });
  }

  const slot = db.slots[slotId];
  if (!slot) {
    return res.status(404).json({ error: 'Slot not found.' });
  }

  const sheet = db.signupSheets[slot.sheetId];
  if (!sheet) {
    return res.status(500).json({ error: 'Signup sheet for this slot is missing.' });
  }

  const key = courseKey(sheet.term, sheet.section);
  const course = db.courses[key];
  if (!course) {
    return res.status(500).json({ error: 'Course for this signup sheet is missing.' });
  }

  const sheetGrades = db.grades[String(sheet.sheetId)] || {};

  const members = slot.signups.map(memberId => {
    const member = course.members[memberId];
    const gradeInfo = sheetGrades[memberId] || {};

    return {
      memberId,
      firstName: member ? member.firstName : '',
      lastName: member ? member.lastName : '',
      role: member ? member.role : '',
      grade: typeof gradeInfo.grade === 'number' ? gradeInfo.grade : null,
      comment: gradeInfo.comment || ''
    };
  });

  res.json({
    slotId: slot.slotId,
    sheetId: slot.sheetId,
    term: sheet.term,
    section: sheet.section,
    members
  });
});


// GRADING SECTION
// Enter or modify a grade
app.post('/api/grade', authRequired(['ta','admin'])/*now this endpoint is open to ta, and admin*/, async (req, res) => {
  await ensureDB();
  const db = await loadDB();

  let { sheetId, memberId, grade, comment } = req.body;

  // Basic validation
  sheetId = Number(sheetId);
  grade = Number(grade);
  memberId = String(memberId || '').trim();

  if (!Number.isInteger(sheetId) || sheetId <= 0) {
    return res.status(400).json({ error: 'Invalid sheetId' });
  }

  if (!memberId || memberId.length !== 8) {
    return res.status(400).json({ error: 'Invalid memberId (must be 8 characters)' });
  }

  if (!Number.isFinite(grade) || grade < 0 || grade > 999) {
    return res.status(400).json({ error: 'Grade must be a number between 0 and 999' });
  }

  comment = String(comment || '');
  if (comment.length > 500) {
    comment = comment.slice(0, 500);
  }
  // Simple sanitization to remove HTML tags
  comment = comment.replace(/[<>]/g, '');

  const sheet = db.signupSheets[sheetId];
  if (!sheet) {
    return res.status(404).json({ error: 'Signup sheet not found' });
  }

  const key = courseKey(sheet.term, sheet.section);
  const course = db.courses[key];
  if (!course) {
    return res.status(500).json({ error: 'Course for this signup sheet is missing' });
  }

  const member = course.members[memberId];
  if (!member) {
    return res.status(404).json({ error: 'Member not found in this course' });
  }

  // Ensure this member is actually signed up for this sheet
  const memberSignedUp = Object.values(db.slots).some(slot =>
    slot.sheetId === sheetId &&
    Array.isArray(slot.signups) &&
    slot.signups.includes(memberId)
  );

  if (!memberSignedUp) {
    return res.status(400).json({ error: 'Member is not signed up for this signup sheet' });
  }

  // Initialize grades structure for this sheet if needed
  if (!db.grades[String(sheetId)]) {
    db.grades[String(sheetId)] = {};
  }

  const sheetGrades = db.grades[String(sheetId)];
  const existing = sheetGrades[memberId] || null;
  const originalGrade = existing ? existing.grade : null;

  // Append comment
  let newComment = comment;
  if (existing && existing.comment) {
    newComment = existing.comment + '\n' + comment;
  }

  sheetGrades[memberId] = {
    grade,
    comment: newComment
  };

  await saveDB(db);

  res.json({
    status: 'success',
    sheetId,
    memberId,
    originalGrade,
    updatedGrade: grade,
    comment: sheetGrades[memberId].comment
  });
});


// GET grade
app.get(
  '/api/ta/grading/current',
  authRequired(['ta', 'admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const now = Date.now();
      let currentSlot = null;
      let currentSlotId = null;

      for (const [slotIdStr, slot] of Object.entries(db.slots)) {
        if (isCurrentSlot(slot)) {
          currentSlot = slot;
          currentSlotId = parseInt(slotIdStr);
          break;
        }
      }

      if (!currentSlot) {
        return res.status(404).json({ error: 'No current slot found.' });
      }

      const sheet = db.signupSheets[currentSlot.sheetId];
      if (!sheet) {
        return res.status(404).json({ error: 'Signup sheet for current slot not found.' });
      }

      currentSlot.members = currentSlot.members || [];
      const sheetGrades = db.grades[sheet.sheetId] || {};

      const members = currentSlot.members.map(memberId => {
        const gradeEntry = sheetGrades[memberId] || {};
        return {
          memberId,
          grade: gradeEntry.grade ?? null,
          bonus: gradeEntry.bonus ?? 0,
          penalty: gradeEntry.penalty ?? 0,
          comment: gradeEntry.comment ?? ''
        };
      });

      res.json({
        slotId: currentSlotId,
        sheetId: sheet.id,
        assignmentName: sheet.assignmentName,
        courseKey: sheet.courseKey,
        start: currentSlot.start,
        slotDuration: currentSlot.slotDuration,
        maxMembers: currentSlot.maxMembers,
        members
      });
    } catch (err) {
      console.error('Error in /api/ta/grading/current:', err);
      res.status(500).json({ error: 'Internal server error fetching current slot.' });
    }
  }
);

// GET /api/ta/grading/slot/:slotId
app.get(
  '/api/ta/grading/slot/:slotId',
  authRequired(['ta', 'admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      await ensureDB();
      const db = await loadDB();

      const slotId = parseInt(req.params.slotId);
      if (Number.isNaN(slotId)) {
        return res.status(400).json({ error: 'Invalid slot ID.' });
      }

      const slot = db.slots[slotId];
      if (!slot) {
        return res.status(404).json({ error: 'Slot not found.' });
      }

      const sheet = db.signupSheets[slot.sheetId];
      if (!sheet) {
        return res.status(404).json({ error: 'Signup sheet not found.' });
      }

      slot.members = slot.members || [];
      const sheetGrades = db.grades[sheet.sheetId] || {};

      const members = slot.members.map(memberId => {
        const gradeEntry = sheetGrades[memberId] || {};
        return {
          memberId,
          grade: gradeEntry.grade ?? null,
          bonus: gradeEntry.bonus ?? 0,
          penalty: gradeEntry.penalty ?? 0,
          comment: gradeEntry.comment ?? ''
        };
      });

      res.json({
        slotId,
        sheetId: sheet.id,
        assignmentName: sheet.assignmentName,
        courseKey: sheet.courseKey,
        start: slot.start,
        slotDuration: slot.slotDuration,
        maxMembers: slot.maxMembers,
        members
      });
    } catch (err) {
      console.error('Error in /api/ta/grading/slot:', err);
      res.status(500).json({ error: 'Internal server error fetching slot.' });
    }
  }
);

// POST /api/ta/grading/grade
// Body: { sheetId, memberId, grade, bonus, penalty, comment }
app.post(
  '/api/ta/grading/grade',
  authRequired(['ta', 'admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      const { sheetId, memberId, grade, bonus, penalty, comment } = req.body || {};

      const sId = parseInt(sheetId);
      if (!sId || !memberId) {
        return res.status(400).json({ error: 'sheetId and memberId are required.' });
      }

      await ensureDB();
      const db = await loadDB();

      const sheet = db.signupSheets[sId];
      if (!sheet) {
        return res.status(404).json({ error: 'Signup sheet not found.' });
      }

      // Initialize grades structure
      db.grades[sId] = db.grades[sId] || {};

      const prev = db.grades[sId][memberId] || null;
      const isUpdate = !!prev;

      const numericGrade = grade !== undefined ? parseInt(grade) : (prev ? prev.grade : 0);
      if (Number.isNaN(numericGrade) || numericGrade < 0 || numericGrade > 999) {
        return res.status(400).json({ error: 'Grade must be between 0 and 999.' });
      }

      const numericBonus = bonus !== undefined ? parseInt(bonus) : (prev ? prev.bonus || 0 : 0);
      const numericPenalty = penalty !== undefined ? parseInt(penalty) : (prev ? prev.penalty || 0 : 0);

      // comment behavior
      const newComment = (comment || '').trim();
      let finalComment = prev ? (prev.comment || '') : '';

      if (isUpdate) {
        // modifying existing: comment is required and appended
        if (!newComment) {
          return res.status(400).json({
            error: 'Comment is required when modifying an existing grade.'
          });
        }
        // append with separator if there was previous comment
        finalComment = finalComment
          ? finalComment + '\n---\n' + newComment
          : newComment;
      } else {
        // new grade: comment optional
        finalComment = newComment;
      }

      db.grades[sId][memberId] = {
        grade: numericGrade,
        bonus: numericBonus,
        penalty: numericPenalty,
        comment: finalComment
      };

      // Audit log: who & when
      const key = `${sId}:${memberId}`;
      db.gradeAudit[key] = {
        lastUpdatedBy: req.user.username,
        lastUpdatedAt: new Date().toISOString()
      };

      await saveDB(db);

      res.json({
        success: true,
        previous: prev,
        current: db.grades[sId][memberId]
      });
    } catch (err) {
      console.error('Error in /api/ta/grading/grade:', err);
      res.status(500).json({ error: 'Internal server error while saving grade.' });
    }
  }
);

// GET /api/ta/grading/audit/:sheetId/:memberId
app.get(
  '/api/ta/grading/audit/:sheetId/:memberId',
  authRequired(['ta', 'admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      const sheetId = parseInt(req.params.sheetId);
      const memberId = req.params.memberId;

      if (!sheetId || !memberId) {
        return res.status(400).json({ error: 'Invalid sheetId or memberId.' });
      }

      await ensureDB();
      const db = await loadDB();

      const key = `${sheetId}:${memberId}`;
      const audit = db.gradeAudit[key];

      if (!audit) {
        return res.status(404).json({ error: 'No audit history found for this grade.' });
      }

      res.json(audit);
    } catch (err) {
      console.error('Error in /api/ta/grading/audit:', err);
      res.status(500).json({ error: 'Internal server error fetching audit history.' });
    }
  }
);


//ADD NEW USER, only by admin
app.post('/api/admin/create-user',
  authRequired(['admin']),
  blockIfFirstLogin,
  async (req, res) => {
    try {
      const { username, password, role } = req.body || {};

      if (!username || !password || !role) {
        return res.status(400).json({ error: "username, password, and role are required" });
      }

      const allowedRoles = ['student', 'ta', 'admin'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be student, ta, or admin" });
      }

      await ensureDB();
      const db = await loadDB();

      const key = username.trim().toLowerCase();
      if (db.users[key]) {
        return res.status(409).json({ error: "User already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      db.users[key] = {
        username: key,
        passwordHash,
        role,
        firstLogin: true
      };

      await saveDB(db);

      res.status(201).json({
        success: true,
        message: "User created successfully",
        user: { username: key, role }
      });

    } catch (err) {
      console.error("Error creating user:", err);
      res.status(500).json({ error: "Internal server error creating user" });
    }
  }
);

// Serve client build (Vite dist)
const CLIENT_DIR = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(CLIENT_DIR));

/* Root endpoint -> React app
app.get('/', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});*/

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});
//Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  	console.log(`Server running http://0.0.0.0:${port}`);
});
