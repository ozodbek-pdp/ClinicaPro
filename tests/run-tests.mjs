#!/usr/bin/env node
import assert from 'assert';

const base = 'http://localhost:3000';
const log = (...args) => console.log(...args);

async function req(path, opts) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch(e) { json = text; }
  return { res, json, text };
}

async function main() {
  log('Starting integration tests against', base);

  // Health
  const health = await req('/api/health');
  log('HEALTH:', health.res.status, JSON.stringify(health.json));
  assert(health.res.ok, 'Health check failed');

  // Auth login (admin)
  const login = await req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@klinika.uz', password: '123' }) });
  log('LOGIN:', login.res.status);
  assert(login.res.ok && login.json && login.json.user, 'Login failed');
  const admin = login.json.user;

  // List users
  const users = await req('/api/users');
  log('USERS count:', Array.isArray(users.json) ? users.json.length : 'NA');
  assert(Array.isArray(users.json), 'GET /api/users failed');

  // Create test patient
  const patientPayload = { first_name: 'E2E', last_name: 'Patient', email: `e2e.patient.${Date.now()}@local`, password: 'p123', role: 'patient', phone: '+998900000000' };
  const createPatient = await req('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patientPayload) });
  log('CREATE PATIENT:', createPatient.res.status, createPatient.json && createPatient.json.id);
  assert(createPatient.res.ok && createPatient.json && createPatient.json.id, 'Create patient failed');
  const patientId = createPatient.json.id;

  // Create test room
  const roomPayload = { room_number: `9${Date.now().toString().slice(-4)}`, specialty: 'TestSpec' };
  const createRoom = await req('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(roomPayload) });
  log('CREATE ROOM:', createRoom.res.status, createRoom.json && createRoom.json.id);
  assert(createRoom.res.ok && createRoom.json && createRoom.json.id, 'Create room failed');
  const roomId = createRoom.json.id;

  // Create test doctor assigned to the room
  const doctorPayload = { first_name: 'E2E', last_name: 'Doctor', email: `e2e.doctor.${Date.now()}@local`, password: 'd123', role: 'doctor', specialty: 'TestSpec', room_number: roomPayload.room_number };
  const createDoctor = await req('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doctorPayload) });
  log('CREATE DOCTOR:', createDoctor.res.status, createDoctor.json && createDoctor.json.id);
  assert(createDoctor.res.ok && createDoctor.json && createDoctor.json.id, 'Create doctor failed');
  const doctorId = createDoctor.json.id;

  // Create diagnosis linking patient and doctor
  const diagPayload = { patient_id: patientId, doctor_id: doctorId, description: 'E2E test diagnosis', treatment_start_date: new Date().toISOString().split('T')[0] };
  const createDiag = await req('/api/diagnoses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diagPayload) });
  log('CREATE DIAG:', createDiag.res.status, createDiag.json && createDiag.json.id);
  assert(createDiag.res.ok && createDiag.json && createDiag.json.id, 'Create diagnosis failed');
  const diagId = createDiag.json.id;

  // Verify diagnosis present
  const diagsList = await req('/api/diagnoses');
  assert(Array.isArray(diagsList.json) && diagsList.json.some(d => d.id === diagId), 'Diagnosis not found in list');

  // Try AI endpoint (may be skipped if key missing)
  const aiTest = await req('/api/ai/generate-bio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Doctor', specialty: 'TestSpec', raw_resume: '', existing_bio: '' }) });
  if (!aiTest.res.ok) {
    log('AI endpoint skipped/unavailable:', aiTest.res.status, aiTest.json || aiTest.text);
  } else {
    log('AI endpoint OK');
  }

  // Cleanup: delete diag, doctor, patient, room
  const delDiag = await req('/api/diagnoses/' + diagId, { method: 'DELETE' });
  log('DEL DIAG:', delDiag.res.status);
  const delDoctor = await req('/api/users/' + doctorId, { method: 'DELETE' });
  log('DEL DOCTOR:', delDoctor.res.status);
  const delPatient = await req('/api/users/' + patientId, { method: 'DELETE' });
  log('DEL PATIENT:', delPatient.res.status);
  const delRoom = await req('/api/rooms/' + roomId, { method: 'DELETE' });
  log('DEL ROOM:', delRoom.res.status, delRoom.json || delRoom.text);

  // Final sanity
  const finalUsers = await req('/api/users');
  const finalRooms = await req('/api/rooms');
  const finalDiags = await req('/api/diagnoses');
  log('FINAL counts — users:', Array.isArray(finalUsers.json) ? finalUsers.json.length : 'NA', 'rooms:', Array.isArray(finalRooms.json) ? finalRooms.json.length : 'NA', 'diags:', Array.isArray(finalDiags.json) ? finalDiags.json.length : 'NA');

  log('All tests completed successfully.');
}

main().catch(err => { console.error('TESTS FAILED:', err); process.exitCode = 2; });
