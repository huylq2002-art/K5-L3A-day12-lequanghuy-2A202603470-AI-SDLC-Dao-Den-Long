const node = id => document.getElementById(id);

async function request(options) {
  const response = await fetch('/api/leaderboard', options);
  if (!response.ok) throw new Error('Leaderboard unavailable');
  return response.json();
}

export function createLeaderboardPanel() {
  const form = node('save-result');
  const button = node('save-score');
  const name = node('player-name');
  const result = node('save-status');
  const list = node('leaderboard-entries');
  const status = node('leaderboard-status');
  let active;

  form.onsubmit = async event => {
    event.preventDefault();
    if (!active || button.disabled) return;
    if (!/^[A-Za-z0-9_]{3,12}$/.test(name.value)) {
      result.textContent = 'Tên cần 3–12 ký tự A–Z, a–z, 0–9 hoặc gạch dưới.';
      return;
    }
    const attempt = active;
    button.disabled = true;
    result.textContent = '';
    try {
      const { saved } = await request({
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...attempt, name: name.value }),
      });
      if (active === attempt) result.textContent = saved ? 'Đã lưu điểm.' : 'Điểm này nằm ngoài 10 hạng đầu.';
    } catch {
      if (active !== attempt) return;
      result.textContent = 'Chưa lưu được điểm. Hãy thử lại.';
      button.disabled = false;
    }
  };

  return {
    offer(slot, campaign) {
      active = { score: campaign.total, nights_won: campaign.lastCreditedNight, seed: campaign.seed };
      form.reset();
      result.textContent = '';
      button.disabled = false;
      node(slot).replaceChildren(form);
      form.hidden = false;
    },
    clear() { active = null; form.hidden = true; },
    async refresh() {
      list.replaceChildren();
      status.textContent = 'Đang tải bảng xếp hạng…';
      try {
        const { entries } = await request();
        status.textContent = entries.length ? '' : 'Chưa có điểm được lưu.';
        entries.forEach((entry, index) => {
          const row = document.createElement('tr');
          for (const value of [index + 1, entry.name, entry.score, entry.nights_won]) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
          }
          list.append(row);
        });
      } catch {
        status.textContent = 'Không đọc được bảng xếp hạng cục bộ.';
      }
    },
  };
}
