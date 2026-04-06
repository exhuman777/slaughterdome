import { sendUpgradePick } from './network.js';

const TIER_COLORS = { common: '#888888', rare: '#4488ff', epic: '#e6993a' };
let shopEl = null;
let keyHandler = null;

export function showUpgradeShop(options) {
  hideUpgradeShop();
  shopEl = document.getElementById('upgrade-shop');
  if (!shopEl) return;
  shopEl.innerHTML = '';
  shopEl.style.display = 'flex';

  options.forEach((opt, i) => {
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.style.borderColor = TIER_COLORS[opt.tier] || '#888';
    card.innerHTML =
      '<div class="upgrade-tier" style="color:' + (TIER_COLORS[opt.tier] || '#888') + '">' + opt.tier.toUpperCase() + '</div>' +
      '<div class="upgrade-name">' + opt.name + '</div>' +
      '<div class="upgrade-desc">' + opt.desc + '</div>' +
      '<div class="upgrade-key">[' + (i + 1) + ']</div>';
    card.addEventListener('click', () => pick(i));
    shopEl.appendChild(card);
  });

  keyHandler = (e) => {
    if (e.code === 'Digit1' || e.code === 'Numpad1') pick(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') pick(1);
    if (e.code === 'Digit3' || e.code === 'Numpad3') pick(2);
  };
  document.addEventListener('keydown', keyHandler);
}

function pick(index) {
  sendUpgradePick(index);
  hideUpgradeShop();
}

export function hideUpgradeShop() {
  if (shopEl) { shopEl.style.display = 'none'; shopEl.innerHTML = ''; }
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
}
