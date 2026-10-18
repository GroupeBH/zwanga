const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const offering = {
  code: 'documents', name: 'Documents', availability: 'open', engagementEnabled: false,
  documentOptions: [{ code: 'permis', label: 'Permis' }, { code: 'assurance', label: 'Assurance' }],
};
const initial = { fullName: 'Compte de test', phone: '0000000000' };
const validForm = { ...initial, vehicleDescription: '', plate: '', documents: ['permis'], description: '' };

function setup(respond = async () => ({ id: 'case-test' }), service = offering) {
  const harness = hookHarness();
  const calls = [];
  let key = 0;
  let currentOffering = service;
  const { useProServiceForm } = loader({
    react: harness.react,
    'expo-crypto': { randomUUID: () => `submission-${++key}` },
    '@/store/api/proServicesApi': {
      useCreateProCaseMutation: () => [body => {
        calls.push(body);
        return { unwrap: () => respond(body, calls.length) };
      }, { isLoading: false }],
    },
  })('features/pro-services/useProServiceForm.ts');
  const render = () => harness.render(() => useProServiceForm(currentOffering, initial));
  const review = () => {
    render().change('documents', ['permis']);
    render().next();
    render().next();
    return render();
  };
  return { render, review, calls, unmount: harness.unmount, setOffering: value => { currentOffering = value; } };
}

test('step validation is specific and accepts no financing by itself', () => {
  const { validateProStep } = loader()('features/pro-services/proServiceFormModel.ts');
  assert.ok(validateProStep({ ...validForm, documents: [] }, offering, 0, false).documents);
  assert.deepEqual(validateProStep(validForm, offering, 0, false), {});
  assert.ok(validateProStep({ ...validForm, documents: ['removed'] }, offering, 2, true).documents);
  assert.ok(validateProStep({ ...validForm, fullName: ' A ' }, offering, 1, false).fullName);
  assert.ok(validateProStep({ ...validForm, phone: 'letters12345678' }, offering, 1, false).phone);
  assert.ok(validateProStep({ ...validForm, phone: '(-------)' }, offering, 1, false).phone);
  assert.ok(validateProStep(validForm, offering, 2, false).consent);
  assert.deepEqual(validateProStep(validForm, offering, 2, true), {});
});

test('a snapshot trims text without modifying the draft or sharing its document array', () => {
  const { applicationSnapshot } = loader()('features/pro-services/proServiceFormModel.ts');
  const form = { ...validForm, fullName: ` ${initial.fullName} `, plate: ' TEST ', documents: ['permis'] };
  const snapshot = applicationSnapshot(form);
  assert.equal(snapshot.fullName, initial.fullName);
  assert.equal(snapshot.plate, 'TEST');
  form.documents.push('assurance');
  assert.deepEqual(snapshot.documents, ['permis']);
});

test('the wizard validates before advancing and does not post until review and consent', async () => {
  const env = setup();
  assert.equal(env.render().form.phone, initial.phone);
  env.render().next();
  assert.equal(env.render().step, 0);
  assert.ok(env.render().errors.documents);
  assert.equal(env.review().step, 2);
  await env.render().submit();
  assert.equal(env.calls.length, 0);
  assert.ok(env.render().errors.consent);
  env.render().toggleConsent();
  await env.render().submit();
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].contactConsent, true);
  assert.equal(env.render().sent, 'case-test');
  await env.render().submit();
  assert.equal(env.calls.length, 1);
});

test('back and review edits preserve draft values and require consent again after changes', () => {
  const env = setup();
  env.review();
  env.render().toggleConsent();
  env.render().goTo(1);
  env.render().change('vehicleDescription', 'Véhicule test');
  assert.equal(env.render().consent, false);
  assert.deepEqual(env.render().form.documents, ['permis']);
  env.render().next();
  assert.equal(env.render().form.vehicleDescription, 'Véhicule test');
  assert.equal(env.render().step, 2);
  assert.equal(env.calls.length, 0);
});

test('future open services use a description, not mandatory document selections', async () => {
  const env = setup(undefined, { ...offering, code: 'equipment', documentOptions: [] });
  env.render().next();
  assert.ok(env.render().errors.description);
  env.render().change('description', 'Besoin de matériel pour mon activité');
  env.render().next();
  env.render().next();
  env.render().toggleConsent();
  await env.render().submit();
  assert.equal(env.calls[0].serviceCode, 'equipment');
  assert.deepEqual(env.calls[0].application.documents, []);
});

test('a synchronous guard blocks double taps and edits before RTK loading re-renders', async () => {
  let finish;
  const env = setup(() => new Promise(resolve => { finish = resolve; }));
  env.review();
  env.render().toggleConsent();
  const view = env.render();
  const first = view.submit();
  await view.submit();
  view.change('fullName', 'Changed while sending');
  assert.equal(env.calls.length, 1);
  assert.equal(env.render().form.fullName, initial.fullName);
  finish({ id: 'confirmed' });
  await first;
  assert.equal(env.render().sent, 'confirmed');
});

test('uncertain retries retain exact payload and key, even after a 429 and a catalogue change', async () => {
  const env = setup(async (_body, count) => {
    if (count === 1) throw { status: 'TIMEOUT_ERROR' };
    if (count === 2) throw { status: 429 };
    return { id: 'recovered' };
  });
  env.review();
  env.render().toggleConsent();
  await env.render().submit();
  assert.equal(env.render().uncertain, true);
  env.render().change('fullName', 'Must not change');
  env.render().goTo(0);
  env.render().toggleConsent();
  assert.equal(env.render().step, 2);
  assert.equal(env.render().form.fullName, initial.fullName);
  assert.equal(env.render().consent, true);
  await env.render().submit();
  assert.equal(env.render().uncertain, true);
  env.setOffering({ ...offering, availability: 'paused', documentOptions: [] });
  await env.render().submit();
  assert.equal(env.render().sent, 'recovered');
  assert.equal(env.calls[0], env.calls[1]);
  assert.equal(env.calls[0], env.calls[2]);
});

test('a first definitive rejection unlocks corrections and allocates a new submission key', async () => {
  const env = setup(async (_body, count) => {
    if (count === 1) throw { status: 400, data: { message: 'Donnée refusée' } };
    return { id: 'corrected' };
  });
  env.review();
  env.render().toggleConsent();
  await env.render().submit();
  assert.equal(env.render().uncertain, false);
  assert.equal(env.render().message, 'Donnée refusée');
  env.render().goTo(1);
  env.render().change('fullName', 'Autre compte test');
  env.render().next();
  env.render().toggleConsent();
  await env.render().submit();
  assert.notEqual(env.calls[0].submissionKey, env.calls[1].submissionKey);
  assert.equal(env.calls[0].application.fullName, initial.fullName);
  assert.equal(env.calls[1].application.fullName, 'Autre compte test');
});

test('a newly paused service cannot receive a new submission', async () => {
  const env = setup();
  env.review();
  env.render().toggleConsent();
  env.setOffering({ ...offering, availability: 'paused' });
  await env.render().submit();
  assert.equal(env.calls.length, 0);
  assert.match(env.render().message, /indisponibles/);
});

test('responses received after unmount do not publish UI state', async () => {
  let finish;
  const env = setup(() => new Promise(resolve => { finish = resolve; }));
  env.review();
  env.render().toggleConsent();
  const promise = env.render().submit();
  env.unmount();
  finish({ id: 'late' });
  await promise;
  assert.equal(env.render().sent, undefined);
});

test('the UI keeps safe-area/keyboard handling and adds no global polling or native modal', () => {
  const root = path.join(__dirname, '../features/pro-services');
  for (const filename of fs.readdirSync(root).filter(name => /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.doesNotMatch(source, /setInterval|pollingInterval|<Modal\b/);
    assert.ok(source.split('\n').length <= 400, filename);
  }
  const layout = fs.readFileSync(path.join(root, 'ServiceLayout.tsx'), 'utf8');
  assert.match(layout, /<SafeAreaView/);
  assert.match(layout, /<KeyboardAvoidingView/);
  assert.match(layout, /ref=\{scrollRef\}/);
  const wizard = fs.readFileSync(path.join(root, 'ServiceRequestForm.tsx'), 'utf8');
  assert.match(wizard, /subscription.remove\(\)/);
  assert.match(wizard, /allowBackGesture=\{!c.locked\}/);
});
