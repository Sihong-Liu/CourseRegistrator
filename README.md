# CourseRegistrator
A web app that can help Admin/TA create courses and course event, then enroll students into course slots. 

#Authentication & Authorization

JWT-based authentication for secure login sessions

Role-based access control (RBAC):

Admin: manage courses and sections

Instructor: manage enrollments and assign grades

Student: view enrolled courses and grades

#Course & Enrollment Management

Create, update, and delete courses and course sections

Add and remove members from courses

Prevent unauthorized access to protected resources

Validate all server-side inputs before processing

#Grading System

Assign grades to students within specific course sections

Enforce instructor-only permission for grading actions

Persist grade records using structured JSON data

#Frontend Integration

Built with HTML, CSS, and vanilla JavaScript

Communicates with backend APIs using asynchronous HTTP requests (fetch)

Lightweight frontend focused on functionality over styling
