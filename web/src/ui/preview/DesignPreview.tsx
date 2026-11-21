import { useEffect, useState } from 'react';
import { Icon, ICON_NAMES } from '../Icon';

type Quality = 'high' | 'low';

const PALETTE: { group: string; tokens: string[] }[] = [
  {
    group: 'Nền gỗ lim',
    tokens: ['--color-bg-deep', '--color-bg', '--color-surface', '--color-surface-raised', '--color-surface-hover'],
  },
  {
    group: 'Đỏ son',
    tokens: ['--lacquer-400', '--lacquer-500', '--lacquer-600', '--lacquer-700', '--lacquer-800'],
  },
  {
    group: 'Vàng cổ / đồng',
    tokens: ['--gold-200', '--gold-300', '--gold-400', '--gold-500', '--bronze-600', '--bronze-700'],
  },
  {
    group: 'Chữ & trạng thái',
    tokens: ['--color-text', '--color-text-muted', '--color-text-subtle', '--color-danger', '--color-success', '--color-focus'],
  },
  {
    group: 'Màu phe',
    tokens: ['--horse-red', '--horse-blue', '--horse-yellow', '--horse-green'],
  },
];

const TYPE_SCALE = ['--text-hero', '--text-3xl', '--text-2xl', '--text-xl', '--text-lg', '--text-md', '--text-sm', '--text-xs'];

function Swatch({ token }: { token: string }) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim()), [token]);
  return (
    <li className="preview-swatch">
      <span className="preview-swatch-chip" style={{ background: `var(${token})` }} />
      <code>{token}</code>
      <span className="ui-muted">{value}</span>
    </li>
  );
}

export function DesignPreview() {
  const [quality, setQuality] = useState<Quality>('high');
  const [selected, setSelected] = useState('medium');

  useEffect(() => {
    document.documentElement.dataset.quality = quality;
  }, [quality]);

  return (
    <main className="preview">
      <section className="preview-hero" aria-labelledby="hero-title">
        <div className="glass preview-hero-panel">
          <p className="ui-eyebrow">Tết này chơi gì?</p>
          <h1 id="hero-title" className="ui-title preview-hero-title">
            Cờ Cá Ngựa 3D
          </h1>
          <p className="preview-hero-copy">
            Đổ xúc xắc, ra chuồng và đua bốn chú ngựa về đích cùng bạn bè. Lượt của bạn — chạm để chơi.
          </p>
          <p className="ui-muted preview-hero-copy">Chữ phụ trên kính: không cần tài khoản, mở là chơi ngay.</p>
          <div className="preview-row">
            <button type="button" className="ui-btn ui-btn--hero">
              Chơi ngay
            </button>
            <button type="button" className="ui-btn ui-btn--secondary">
              <Icon name="user" />
              Tạo phòng
            </button>
          </div>
        </div>
      </section>

      <section className="glass preview-section" aria-labelledby="quality-title">
        <h2 id="quality-title" className="ui-title preview-h2">
          Kính &amp; chất lượng
        </h2>
        <p className="ui-muted">
          <code>html[data-quality]</code> do cảnh 3D đặt. <code>low</code> bỏ hiệu ứng mờ, dùng nền đặc.
        </p>
        <div className="preview-row" role="group" aria-label="Chất lượng">
          {(['high', 'low'] as const).map((q) => (
            <button key={q} type="button" className="ui-pill" aria-pressed={quality === q} onClick={() => setQuality(q)}>
              data-quality=&quot;{q}&quot;
            </button>
          ))}
        </div>
      </section>

      <section className="glass preview-section" aria-labelledby="palette-title">
        <h2 id="palette-title" className="ui-title preview-h2">
          Bảng màu
        </h2>
        {PALETTE.map(({ group, tokens }) => (
          <div key={group} className="preview-palette-group">
            <h3 className="ui-eyebrow">{group}</h3>
            <ul className="preview-swatches">
              {tokens.map((t) => (
                <Swatch key={t} token={t} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="glass preview-section" aria-labelledby="type-title">
        <h2 id="type-title" className="ui-title preview-h2">
          Chữ
        </h2>
        <div className="preview-type">
          <p className="ui-eyebrow">Playfair Display 600 / 700 / 800 — tiêu đề</p>
          <p className="ui-title" style={{ fontSize: 'var(--text-3xl)', fontWeight: 800 }}>
            Cờ Cá Ngựa 3D
          </p>
          <p className="ui-title" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
            Lượt của bạn
          </p>
          <p className="ui-title" style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>
            Đổ xúc xắc
          </p>
          <p className="ui-eyebrow">Be Vietnam Pro 400 → 800 — giao diện</p>
          {[400, 500, 600, 700, 800].map((w) => (
            <p key={w} style={{ margin: 0, fontWeight: w, fontSize: 'var(--text-lg)' }}>
              {w} · Ra chuồng · Tạo phòng · Đổ xúc xắc · ăn quân, về đích
            </p>
          ))}
          <p className="ui-eyebrow">Thang cỡ chữ</p>
          {TYPE_SCALE.map((t) => (
            <p key={t} className="preview-scale" style={{ fontSize: `var(${t})` }}>
              <code>{t}</code> Lượt của bạn
            </p>
          ))}
        </div>
      </section>

      <section className="glass preview-section" aria-labelledby="buttons-title">
        <h2 id="buttons-title" className="ui-title preview-h2">
          Nút
        </h2>
        <div className="preview-button-grid">
          <span className="ui-eyebrow">Mặc định</span>
          <span className="ui-eyebrow">Focus</span>
          <span className="ui-eyebrow">Chọn</span>
          <span className="ui-eyebrow">Tắt</span>
          {(
            [
              ['ui-btn--hero', 'Chơi ngay'],
              ['ui-btn--primary', 'Đổ xúc xắc'],
              ['ui-btn--secondary', 'Tạo phòng'],
              ['ui-btn--ghost', 'Ra chuồng'],
              ['ui-btn--danger', 'Đóng phòng'],
            ] as const
          ).flatMap(([variant, text]) => [
            <button key={`${variant}-d`} type="button" className={`ui-btn ${variant}`}>
              {text}
            </button>,
            <button key={`${variant}-f`} type="button" className={`ui-btn ${variant} preview-force-focus`}>
              {text}
            </button>,
            <button key={`${variant}-s`} type="button" className={`ui-btn ${variant}`} aria-pressed="true">
              {text}
            </button>,
            <button key={`${variant}-x`} type="button" className={`ui-btn ${variant}`} disabled>
              {text}
            </button>,
          ])}
        </div>
        <h3 className="ui-eyebrow preview-h3">Nút biểu tượng &amp; pill</h3>
        <div className="preview-row">
          <button type="button" className="ui-btn ui-btn--icon" aria-label="Âm thanh">
            <Icon name="sound-on" />
          </button>
          <button type="button" className="ui-btn ui-btn--icon" aria-label="Menu">
            <Icon name="menu" />
          </button>
          <button type="button" className="ui-btn ui-btn--icon" aria-label="Đóng" aria-pressed="true">
            <Icon name="close" />
          </button>
          <button type="button" className="ui-btn ui-btn--icon" aria-label="Luật chơi" disabled>
            <Icon name="rules" />
          </button>
          <div className="preview-row" role="radiogroup" aria-label="Độ khó máy">
            {(
              [
                ['easy', 'Dễ'],
                ['medium', 'Vừa'],
                ['hard', 'Khó'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                className="ui-pill"
                aria-checked={selected === id}
                onClick={() => setSelected(id)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="glass preview-section" aria-labelledby="icons-title">
        <h2 id="icons-title" className="ui-title preview-h2">
          Biểu tượng
        </h2>
        <ul className="preview-icons">
          {ICON_NAMES.map((name) => (
            <li key={name}>
              <Icon name={name} size="lg" />
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <div className="preview-row preview-icon-sizes">
          {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
            <span key={s}>
              <Icon name="dice" size={s} /> <code>{s}</code>
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
