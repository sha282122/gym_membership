
const express = require('express');
const session = require('express-session');
const conn = require('./conn');
const app = express();
app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));


app.use(session({
    secret: process.env.SESSION_SECRET || 'gym-system-session-secret-change-this',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 8 * 60 * 60 * 1000
    }
}));

app.set('view engine', 'ejs');

// ADMIN LOGIN PROTECTION
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.adminId) {
        return res.redirect('/adminLogin');
    }

    next();
}

// HOME PAGE
app.get('/', (req, res) => {
    res.render('userIndex');
});

app.get('/userIndex', (req, res) => {
    res.render('userIndex');
});

// ADMIN LOGIN PAGE
app.get('/adminLogin', (req, res) => {
    if (req.session.adminId) {
        return res.redirect('/adminIndex');
    }

    res.render('adminLogin', {
        error: ''
    });
});

// ADMIN LOGIN PROCESS - SIMPLE DATABASE LOGIN
app.post('/adminLogin', (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    const select = `
        SELECT * FROM gym_admins
        WHERE username = ${conn.escape(username)}
        LIMIT 1
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('ADMIN LOGIN ERROR:', err);
            return res.send('Error logging in: ' + err.message);
        }

        if (
            data.length === 0 ||
            password !== data[0].password
        ) {
            return res.status(401).render('adminLogin', {
                error: 'Invalid username or password.'
            });
        }

        // CREATE ADMIN SESSION
        req.session.regenerate((err) => {
            if (err) {
                console.log('SESSION ERROR:', err);
                return res.status(500).send('Unable to start session.');
            }

            req.session.adminId = data[0].id;

            req.session.save((err) => {
                if (err) {
                    console.log('SESSION SAVE ERROR:', err);
                    return res.status(500).send('Unable to save session.');
                }

                res.redirect('/adminIndex');
            });
        });
    });
});

// ADMIN LOGOUT
app.post('/adminLogout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log('LOGOUT ERROR:', err);
            return res.status(500).send('Unable to log out.');
            `<script>`
        }

        res.clearCookie('connect.sid');
        res.redirect('/adminLogin');
    });
});

// ADMIN DASHBOARD
app.get('/adminIndex', requireAdmin, (req, res) => {
    res.render('adminIndex');
});

// REGULAR REGISTRATION PAGE - ADMIN ONLY
app.get('/index', requireAdmin, (req, res) => {
    res.render('index');
});

// WALK-IN REGISTRATION PAGE - PUBLIC
app.get('/walkin', (req, res) => {
    res.render('walkin');
});

// REGULAR MEMBER OPTION
app.get('/regular', (req, res) => {
    res.redirect('/member');
});

// REGISTER WALK-IN
app.post('/walkin/register', (req, res) => {
    const fn = req.body.fn;
    const ln = req.body.ln;
    const age = Number(req.body.age);
    const contact = req.body.contact || '';

    if (!fn || !ln || !Number.isInteger(age) || age < 1) {
        return res.send('Please enter valid walk-in information.');
    }

    const insert = `
        INSERT INTO gym_walkins
        (firstname, lastname, age, contact, visit_date)
        VALUES (
            ${conn.escape(fn)},
            ${conn.escape(ln)},
            ${age},
            ${conn.escape(contact)},
            NOW()
        )
    `;

    conn.query(insert, (err, result) => {
        if (err) {
            console.log('WALK-IN REGISTER ERROR:', err);
            return res.send('Error registering walk-in: ' + err.message);
        }

        res.send(`
            <script>
                alert('Thank you! Enjoy lifting!');
                location.href = '/userIndex';
            </script>
        `);
    });
});

// ADMIN WALK-IN LIST - TODAY ONLY
app.get('/adminWalkinList', requireAdmin, (req, res) => {
    const select = `
        SELECT * FROM gym_walkins
        WHERE visit_date >= CURDATE()
        AND visit_date < CURDATE() + INTERVAL 1 DAY
        ORDER BY visit_date DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('WALK-IN LIST ERROR:', err);
            return res.send('Error loading walk-in list: ' + err.message);
        }

        res.render('adminWalkinList', {
            walkins: data
        });
    });
});

// WALK-IN ATTENDANCE HISTORY
app.get('/adminWalkinHistory', requireAdmin, (req, res) => {
    const select = `
        SELECT * FROM gym_walkins
        ORDER BY visit_date DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('WALK-IN HISTORY ERROR:', err);
            return res.send('Error loading walk-in history: ' + err.message);
        }

        res.render('adminWalkinHistory', {
            walkins: data
        });
    });
});

// REGISTER REGULAR MEMBER - ADMIN ONLY
app.post('/register', requireAdmin, (req, res) => {
    const fn = req.body.fn;
    const ln = req.body.ln;
    const age = Number(req.body.age);
    const contact = req.body.contact || '';
    const months_avail = Number(req.body.months_avail);
    const payment_status = req.body.payment_status;

    if (
        !fn ||
        !ln ||
        !Number.isInteger(age) ||
        age < 1 ||
        !Number.isInteger(months_avail) ||
        months_avail < 1 ||
        !['Paid', 'Unpaid'].includes(payment_status)
    ) {
        return res.send('Please enter valid member information.');
    }

    const total_payment = 500 * months_avail;

    const insert = `
        INSERT INTO gym_regulars
        (firstname, lastname, age, months_avail, payment_status,
         avail_date, expire_date, contact, total_payment)
        VALUES (
            ${conn.escape(fn)},
            ${conn.escape(ln)},
            ${age},
            ${months_avail},
            ${conn.escape(payment_status)},
            CURDATE(),
            DATE_ADD(CURDATE(), INTERVAL ${months_avail} MONTH),
            ${conn.escape(contact)},
            ${total_payment}
        )
    `;

    conn.query(insert, (err, result) => {
        if (err) {
            console.log('REGULAR REGISTER ERROR:', err);
            return res.send('Error registering member: ' + err.message);
        }

        res.redirect('/adminRegularMemberList');
    });
});

// MEMBER SEARCH PAGE - PUBLIC
app.get('/member', (req, res) => {
    res.render('member', {
        searched: false,
        data: null,
        checkedIn: false
    });
});

// SEARCH MEMBER BY ID
app.get('/member/search', (req, res) => {
    const id = Number(req.query.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.render('member', {
            searched: true,
            data: null,
            checkedIn: false
        });
    }

    const search = `
        SELECT * FROM gym_regulars
        WHERE id = '${id}'
    `;

    conn.query(search, (err, result) => {
        if (err) {
            console.log('SEARCH ERROR:', err);
            return res.send('Error searching member: ' + err.message);
        }

        if (result.length === 0) {
            return res.render('member', {
                searched: true,
                data: null,
                checkedIn: false
            });
        }

        const memberData = result[0];

        const attendance = `
            SELECT * FROM gym_attendance
            WHERE member_id = '${id}'
            AND DATE(check_in) = CURDATE()
        `;

        conn.query(attendance, (err, attendanceData) => {
            if (err) {
                console.log('ATTENDANCE SEARCH ERROR:', err);
                return res.send('Error checking attendance: ' + err.message);
            }

            res.render('member', {
                searched: true,
                data: memberData,
                checkedIn: attendanceData.length > 0
            });
        });
    });
});

// CHECK IN MEMBER ONLY - PUBLIC
app.post('/checkin/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.send('Invalid member ID.');
    }

    const search = `
        SELECT * FROM gym_regulars
        WHERE id = '${id}'
        AND expire_date >= CURDATE()
    `;

    conn.query(search, (err, data) => {
        if (err) {
            console.log('CHECK-IN SEARCH ERROR:', err);
            return res.send('Error checking member: ' + err.message);
        }

        if (data.length === 0) {
            return res.send('Member not found or membership expired.');
        }

        const member = data[0];

        const checkToday = `
            SELECT * FROM gym_attendance
            WHERE member_id = '${id}'
            AND DATE(check_in) = CURDATE()
        `;

        conn.query(checkToday, (err, attendanceData) => {
            if (err) {
                console.log('CHECK-IN STATUS ERROR:', err);
                return res.send('Error checking attendance: ' + err.message);
            }

            if (attendanceData.length > 0) {
                return res.redirect('/member/search?id=' + id);
            }

            const insert = `
                INSERT INTO gym_attendance
                (member_id, firstname, lastname, check_in)
                VALUES (
                    '${id}',
                    ${conn.escape(member.firstname)},
                    ${conn.escape(member.lastname)},
                    NOW()
                )
            `;

            conn.query(insert, (err, result) => {
                if (err) {
                    console.log('CHECK-IN INSERT ERROR:', err);
                    return res.send('Error checking in: ' + err.message);
                }

                res.send(`
                    <script>
                        alert('Thank you! Enjoy lifting!');
                        window.location.href = '/userIndex';
                    </script>
                `);
            });
        });
    });
});

// ADMIN ATTENDANCE LIST - TODAY ONLY
app.get('/adminAttendanceList', requireAdmin, (req, res) => {
    const select = `
        SELECT * FROM gym_attendance
        WHERE check_in >= CURDATE()
        AND check_in < CURDATE() + INTERVAL 1 DAY
        ORDER BY check_in DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('ADMIN ATTENDANCE LIST ERROR:', err);
            return res.send('Error loading today attendance: ' + err.message);
        }

        res.render('adminAttendanceList', {
            attendance: data
        });
    });
});

// ADMIN ATTENDANCE HISTORY - ALL RECORDS
app.get('/adminAttendanceHistory', requireAdmin, (req, res) => {
    const select = `
        SELECT * FROM gym_attendance
        ORDER BY check_in DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('ADMIN ATTENDANCE HISTORY ERROR:', err);
            return res.send('Error loading attendance history: ' + err.message);
        }

        res.render('adminAttendanceHistory', {
            attendance: data
        });
    });
});

// VIEW REGULAR MEMBERS - ADMIN ONLY
app.get('/view', requireAdmin, (req, res) => {
    const select = `
        SELECT * FROM gym_regulars
        ORDER BY id DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('VIEW MEMBERS ERROR:', err);
            return res.send('Error loading members: ' + err.message);
        }

        res.render('adminRegularMemberList', {
            member: data,
            search: ''
        });
    });
});

// ADMIN REGULAR MEMBER LIST
app.get('/adminRegularMemberList', requireAdmin, (req, res) => {
    const select = `
        SELECT * FROM gym_regulars
        ORDER BY id DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('ADMIN REGULAR MEMBER LIST ERROR:', err);
            return res.send('Error loading regular members: ' + err.message);
        }

        res.render('adminRegularMemberList', {
            member: data,
            search: ''
        });
    });
});

// SEARCH REGULAR MEMBERS BY FIRST NAME OR LAST NAME
app.get('/adminRegularMemberList/search', requireAdmin, (req, res) => {
    const search = (req.query.search || '').trim();
    const safeSearch = conn.escape(search);

    const select = `
        SELECT * FROM gym_regulars
        WHERE firstname LIKE CONCAT('%', ${safeSearch}, '%')
        OR lastname LIKE CONCAT('%', ${safeSearch}, '%')
        ORDER BY id DESC
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('SEARCH MEMBERS ERROR:', err);
            return res.send('Error searching members: ' + err.message);
        }

        res.render('adminRegularMemberList', {
            member: data,
            search: search
        });
    });
});

// DELETE REGULAR MEMBER
app.get('/delete/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.send('Invalid member ID.');
    }

    const remove = `
        DELETE FROM gym_regulars
        WHERE id = '${id}'
    `;

    conn.query(remove, (err, result) => {
        if (err) {
            console.log('DELETE MEMBER ERROR:', err);
            return res.send('Error deleting member: ' + err.message);
        }

        res.redirect('/adminRegularMemberList');
    });
});

// EDIT REGULAR MEMBER
app.get('/edit/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.send('Invalid member ID.');
    }

    const select = `
        SELECT * FROM gym_regulars
        WHERE id = '${id}'
    `;

    conn.query(select, (err, data) => {
        if (err) {
            console.log('EDIT MEMBER ERROR:', err);
            return res.send('Error loading member: ' + err.message);
        }

        if (data.length === 0) {
            return res.send('Member not found.');
        }

        res.render('edit', {
            data: data[0]
        });
    });
});

// UPDATE REGULAR MEMBER
app.post('/update/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    const fn = String(req.body.fn || req.body.firstname || '').trim();
    const ln = String(req.body.ln || req.body.lastname || '').trim();
    const age = Number(req.body.age);
    const contact = String(req.body.contact || '').trim();
    const months_avail = Number(req.body.months_avail || req.body.months);
    const payment_status = String(req.body.payment_status || '')
        .trim()
        .toLowerCase();

    console.log('UPDATE MEMBER DATA:', req.body);

    if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !fn ||
        !ln ||
        !Number.isInteger(age) ||
        age < 1 ||
        !Number.isInteger(months_avail) ||
        months_avail < 1 ||
        !['paid', 'unpaid'].includes(payment_status)
    ) {
        return res.send('Please enter valid member information.');
    }

    const total_payment = 500 * months_avail;
    const final_status = payment_status === 'paid' ? 'Paid' : 'Unpaid';

    const update = `
        UPDATE gym_regulars
        SET firstname = ${conn.escape(fn)},
            lastname = ${conn.escape(ln)},
            age = ${age},
            contact = ${conn.escape(contact)},
            months_avail = ${months_avail},
            payment_status = ${conn.escape(final_status)},
            total_payment = ${total_payment},
            expire_date = DATE_ADD(
                avail_date,
                INTERVAL ${months_avail} MONTH
            )
        WHERE id = ${id}
    `;

    conn.query(update, (err, result) => {
        if (err) {
            console.log('UPDATE MEMBER ERROR:', err);
            return res.send('Error updating member: ' + err.message);
        }

        if (result.affectedRows === 0) {
            return res.send('No changes made or member not found.');
        }

        res.redirect('/adminRegularMemberList');
    });
});

// START SERVER
app.listen(9000, () => {
    console.log('Server running at http://localhost:9000');
});
