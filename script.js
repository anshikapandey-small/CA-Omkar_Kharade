const tabs = document.querySelectorAll('.calc-tabs button');
tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.calc').forEach(c => c.classList.add('hidden'));
    document.getElementById('calc-' + btn.dataset.calc)?.classList.remove('hidden')
}
));
const money = n => new Intl.NumberFormat('en-IN',{
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
}).format(n || 0);
function calcGST() {
    const amountEl = document.getElementById('gstAmount')
      , rateEl = document.getElementById('gstRate')
      , outEl = document.getElementById('gstResult');
    if (!amountEl || !rateEl || !outEl)
        return;
    const a = +amountEl.value || 0
      , r = +rateEl.value || 0
      , g = a * r / 100;
    outEl.textContent = `${money(g)} GST · ${money(a + g)} total`
}
function calcEMI() {
    const loanEl = document.getElementById('loan')
      , rateEl = document.getElementById('rate')
      , yearsEl = document.getElementById('years')
      , outEl = document.getElementById('emiResult');
    if (!loanEl || !rateEl || !yearsEl || !outEl)
        return;
    const p = +loanEl.value || 0
      , r = (+rateEl.value || 0) / 1200
      , n = (+yearsEl.value || 0) * 12;
    const e = r ? p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : (n ? p / n : 0);
    outEl.textContent = `${money(e)} / month`
}
function calcProfit() {
    const revEl = document.getElementById('revenue')
      , expEl = document.getElementById('expenses')
      , outEl = document.getElementById('profitResult');
    if (!revEl || !expEl || !outEl)
        return;
    const r = +revEl.value || 0
      , e = +expEl.value || 0;
    outEl.textContent = `${money(r - e)} net profit`
}
function calcTDS() {
    const amountEl = document.getElementById('tdsAmount')
      , rateEl = document.getElementById('tdsRate')
      , outEl = document.getElementById('tdsResult');
    if (!amountEl || !rateEl || !outEl)
        return;
    const a = +amountEl.value || 0
      , r = +rateEl.value || 0
      , t = a * r / 100;
    outEl.textContent = `${money(t)} TDS · ${money(a - t)} net`
}
function submitForm(e) {
    e.preventDefault();
    const form = e.target;
    const noteEl = document.getElementById('formNote');
    const btn = form.querySelector('button[type="submit"]');
    const accessKey = form.querySelector('input[name="access_key"]')?.value;

    if (!accessKey) {
        noteEl.textContent = 'Form is not fully configured yet — please add a Web3Forms access key.';
        return;
    }

    const data = new FormData(form);
    const originalBtnText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    noteEl.textContent = '';

    fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: data
    })
    .then(res => res.json())
    .then(result => {
        if (result.success) {
            noteEl.textContent = 'Thank you! Your enquiry has been sent. We\'ll get back to you shortly.';
            form.reset();
        } else {
            noteEl.textContent = 'Something went wrong while sending your enquiry. Please try again or contact us directly.';
        }
    })
    .catch(() => {
        noteEl.textContent = 'Something went wrong while sending your enquiry. Please try again or contact us directly.';
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = originalBtnText;
    });
}
const menu = document.querySelector('.menu-toggle')
  , nav = document.querySelector('.nav');
menu?.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(isOpen));
});
// Mobile: tapping "Services" / "Knowledge Bank" expands or collapses its links
document.querySelectorAll('.nav-drop > button').forEach(btn => {
    btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
});
calcGST();
calcEMI();
calcProfit();
calcTDS();

// ---- Scroll reveal (About-us style opposite-side convergence, service-card
// converge, and staggered fade-ups) + a small header shadow on scroll ----
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealTargets = document.querySelectorAll('.reveal, .reveal-split, .reveal-grid, .reveal-stagger');
if (reduceMotion) {
    revealTargets.forEach(el => el.classList.add('in-view'));
} else if ('IntersectionObserver'in window) {
    const io = new IntersectionObserver( (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        }
        );
    }
    ,{
        threshold: 0.18,
        rootMargin: '0px 0px -60px 0px'
    });
    revealTargets.forEach(el => io.observe(el));
} else {
    revealTargets.forEach(el => el.classList.add('in-view'));
}

const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
    const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, {
        passive: true
    });
    onScroll();
}