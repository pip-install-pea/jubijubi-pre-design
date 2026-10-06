'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Printer, X } from '@phosphor-icons/react';
import { currentCalendarYear, currentFinancialYear, financialYearList, financialYearListFloor } from '@/lib/phpRegistry.js';
import { splitList } from '@/lib/analytics.js';
import { printDashboard } from '@/lib/printCharts';

function moduleFromPath(pathname) {
  if (pathname?.startsWith('/admin')) return 'admin';
  if (pathname?.startsWith('/health')) return 'health';
  if (pathname?.startsWith('/livelihood')) return 'livelihood';
  if (pathname?.startsWith('/education')) return 'education';
  return 'overview';
}

function pageTitle(pathname) {
  if (pathname === '/') return 'Overview';
  if (pathname?.startsWith('/health')) return 'Health';
  if (pathname?.startsWith('/livelihood')) return 'Livelihood';
  if (pathname?.startsWith('/education')) return 'Education';
  if (pathname?.startsWith('/admin/users')) return 'Users';
  if (pathname?.startsWith('/admin/add-data')) return 'Add data';
  if (pathname?.startsWith('/admin/sync')) return 'Sync';
  return 'Jubilant';
}

function pageSub(pathname) {
  if (pathname === '/') return 'Open a programme, then a chart for the rows behind the number.';
  if (pathname?.startsWith('/health')) return 'Reach, disease mix, and clinic activity.';
  if (pathname?.startsWith('/livelihood/placement')) return 'Roster follow-up and field-sheet income.';
  if (pathname?.startsWith('/livelihood/enterprise')) return 'Members, market access, and financial-year profit.';
  if (pathname?.startsWith('/livelihood')) return 'Field sheet first, then the skill roster.';
  if (pathname?.startsWith('/education')) return 'Students, schools, and programme outcomes.';
  if (pathname?.startsWith('/admin/users')) return 'Platform access and roles.';
  if (pathname?.startsWith('/admin/add-data')) return 'Browse records or add them manually.';
  if (pathname?.startsWith('/admin/sync')) return 'Refresh programme data and review the log.';
  return '';
}

function calendarYears() {
  const thisYear = Number(currentCalendarYear());
  const years = [];
  for (let y = thisYear; y >= 2020; y--) years.push(String(y));
  return years;
}

function defaultsFor(mod) {
  const fy = currentFinancialYear();
  const year = currentCalendarYear();
  const base = {
    state_id: '',
    district_id: '',
    year: '',
    academic_year: '',
    financial_year: '',
    gender: '',
    month: ''
  };
  if (mod === 'health') return { ...base, year };
  if (mod === 'education') return { ...base, academic_year: fy, financial_year: fy };
  if (mod === 'livelihood') return { ...base, academic_year: fy, financial_year: fy };
  if (mod === 'overview') return { ...base, year, academic_year: fy, financial_year: fy };
  return base;
}

function payloadFor(mod, filters) {
  const fy = filters.financial_year || filters.academic_year || '';
  const ay = filters.academic_year || filters.financial_year || '';
  if (mod === 'health') {
    return {
      geo_module: 'health',
      state_id: filters.state_id,
      district_id: filters.district_id,
      year: filters.year,
      gender: filters.gender
    };
  }
  if (mod === 'education') {
    return {
      geo_module: 'education',
      state_id: filters.state_id,
      district_id: filters.district_id,
      academic_year: ay,
      financial_year: fy || ay
    };
  }
  if (mod === 'livelihood') {
    return {
      geo_module: 'livelihood',
      state_id: filters.state_id,
      district_id: filters.district_id,
      academic_year: fy,
      financial_year: fy,
      month: filters.month || ''
    };
  }
  if (mod === 'overview') {
    return {
      geo_module: 'overview',
      year: filters.year,
      academic_year: fy,
      financial_year: fy
    };
  }
  return { geo_module: mod };
}

function queryFromPayload(payload) {
  const params = new URLSearchParams();
  for (const key of ['state_id', 'district_id', 'year', 'academic_year', 'financial_year', 'gender', 'month']) {
    if (payload[key]) params.set(key, String(payload[key]));
  }
  return params.toString();
}

function readUrl(searchParams, mod) {
  const next = defaultsFor(mod);
  const state = searchParams.get('state_id');
  const district = searchParams.get('district_id');
  const year = searchParams.get('year');
  const ay = searchParams.get('academic_year');
  const fy = searchParams.get('financial_year');
  const gender = searchParams.get('gender');
  if (state) next.state_id = state;
  if (district) next.district_id = district;
  if (year && (mod === 'health' || mod === 'overview')) next.year = year;
  if (gender && mod === 'health') next.gender = gender;
  const clock = fy || ay;
  if (clock && (mod === 'education' || mod === 'livelihood' || mod === 'overview')) {
    next.academic_year = clock;
    next.financial_year = clock;
  }
  const month = searchParams.get('month');
  if (month && mod === 'livelihood') next.month = month;
  return next;
}

function MultiSelect({ label, name, value, options, onChange, disabled, emptyLabel }) {
  const selected = splitList(value);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const summary = !selected.length
    ? emptyLabel
    : selected.length === 1
      ? (options.find((opt) => String(opt.id) === selected[0])?.name || selected[0])
      : `${selected.length} selected`;

  const toggle = (id) => {
    const key = String(id);
    const next = selected.includes(key)
      ? selected.filter((item) => item !== key)
      : [...selected, key];
    onChange(name, next.join(','));
  };

  return (
    <div className={`multi-select ${disabled ? 'is-disabled' : ''}`} ref={ref}>
      <button
        type="button"
        className="multi-select__btn"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        {summary}
      </button>
      {open && !disabled && (
        <div className="multi-select__menu" role="listbox" aria-label={label}>
          {options.length === 0 && <div className="multi-select__empty">Nothing to choose</div>}
          {options.map((opt) => {
            const id = String(opt.id);
            return (
              <label key={id} className="multi-select__option">
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={() => toggle(id)}
                />
                <span>{opt.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GlobalFilters({ onApply }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleName = moduleFromPath(pathname);
  const isAdmin = moduleName === 'admin';
  const showLocation = moduleName === 'health' || moduleName === 'livelihood' || moduleName === 'education';
  const showCalendar = moduleName === 'health' || moduleName === 'overview';
  const showFy = moduleName === 'education' || moduleName === 'livelihood' || moduleName === 'overview';
  const showGender = moduleName === 'health';
  const fyLabel = moduleName === 'education' ? 'Academic year' : 'Financial year';

  const [locations, setLocations] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [filters, setFilters] = useState(() => defaultsFor(moduleName));
  const activeStateIdRef = useRef('');
  const lastQueryRef = useRef('');
  const lastPayloadRef = useRef('');
  const applyRef = useRef(null);
  const filtersRef = useRef(filters);
  const moduleRef = useRef(moduleName);
  moduleRef.current = moduleName;

  const apply = (next, { writeUrl = true } = {}) => {
    const body = payloadFor(moduleName, next);
    const serialized = JSON.stringify(body);
    if (writeUrl && !isAdmin) {
      const qs = queryFromPayload(body);
      if (qs !== lastQueryRef.current) {
        lastQueryRef.current = qs;
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    }
    if (serialized === lastPayloadRef.current) return;
    lastPayloadRef.current = serialized;
    onApply(body);
  };
  applyRef.current = apply;
  filtersRef.current = filters;

  const fetchLocations = React.useCallback(async (mod) => {
    if (mod === 'overview' || mod === 'admin') {
      setLocations([]);
      return;
    }
    try {
      const response = await axios.get(`/api/locations?module=${mod}`);
      setLocations(Array.isArray(response.data) ? response.data : []);
    } catch {
      setLocations([]);
    }
  }, []);

  const fetchDistricts = React.useCallback(async (stateId, mod) => {
    activeStateIdRef.current = stateId;
    try {
      const response = await axios.get(`/api/locations?module=${mod}&state_id=${stateId}`);
      if (activeStateIdRef.current === stateId) {
        setDistricts(Array.isArray(response.data) ? response.data : []);
      }
    } catch {
      if (activeStateIdRef.current === stateId) setDistricts([]);
    }
  }, []);

  useEffect(() => {
    const next = readUrl(searchParams, moduleName);
    lastPayloadRef.current = '';
    setFilters(next);
    activeStateIdRef.current = '';
    setDistricts([]);
    setLocations([]);
    fetchLocations(moduleName);
    if (next.state_id && showLocation) fetchDistricts(next.state_id, moduleName);
    lastQueryRef.current = '';
    apply(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleName]);

  useEffect(() => {
    const onPatch = (e) => {
      const patch = e.detail || {};
      const next = { ...filtersRef.current, ...patch };
      if (patch.academic_year || patch.financial_year) {
        const clock = patch.financial_year || patch.academic_year;
        next.academic_year = clock;
        next.financial_year = clock;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'state_id')) {
        const stateId = String(patch.state_id || '').split(',').filter(Boolean)[0] || '';
        if (stateId) fetchDistricts(stateId, moduleRef.current);
        else {
          activeStateIdRef.current = '';
          setDistricts([]);
        }
      }
      setFilters(next);
      applyRef.current?.(next);
    };
    window.addEventListener('app:filters:patch', onPatch);
    return () => window.removeEventListener('app:filters:patch', onPatch);
  }, []);

  const setField = (name, value) => {
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'academic_year' || name === 'financial_year') {
        next.academic_year = value;
        next.financial_year = value;
      }
      if (name === 'state_id') {
        next.district_id = '';
        if (value) fetchDistricts(value, moduleName);
        else {
          activeStateIdRef.current = '';
          setDistricts([]);
        }
      }
      apply(next);
      return next;
    });
  };

  const removeValue = (key, id) => {
    const remaining = splitList(filters[key]).filter((item) => item !== String(id));
    setField(key, remaining.join(','));
  };

  const handleReset = () => {
    const next = defaultsFor(moduleName);
    activeStateIdRef.current = '';
    setFilters(next);
    setDistricts([]);
    apply(next);
  };

  const stateIds = splitList(filters.state_id);
  const districtIds = splitList(filters.district_id);
  const chips = [];
  for (const id of stateIds) {
    const name = locations.find((s) => String(s.id) === id)?.name || id;
    if (showLocation) chips.push({ key: 'state_id', id, label: name });
  }
  for (const id of districtIds) {
    const name = districts.find((d) => String(d.id) === id)?.name || id;
    if (showLocation) chips.push({ key: 'district_id', id, label: name });
  }
  if (moduleName === 'livelihood') {
    for (const id of splitList(filters.month)) {
      chips.push({ key: 'month', id, label: id });
    }
  }
  for (const id of splitList(filters.gender)) {
    if (showGender) chips.push({ key: 'gender', id, label: id === 'F' ? 'Female' : 'Male' });
  }

  const fyYears = moduleName === 'livelihood'
    ? financialYearListFloor(8, '2023-24')
    : financialYearList(8);
  const years = calendarYears();

  const liveTabs = pathname?.startsWith('/livelihood');
  const subtitle = pageSub(pathname);

  return (
    <header className="filter-bar">
      <div className="filter-bar__row">
        <div className="filter-bar__identity">
          <h1 className="filter-bar__title">{pageTitle(pathname)}</h1>
          {subtitle && <p className="filter-bar__sub">{subtitle}</p>}
        </div>

        {liveTabs && (
          <nav className="filter-bar__tabs" aria-label="Livelihood pages">
            <Link
              href="/livelihood/skilling"
              className={`filter-tab ${pathname?.startsWith('/livelihood/skilling') ? 'is-active' : ''}`}
            >
              Skilling
            </Link>
            <Link
              href="/livelihood/placement"
              className={`filter-tab ${pathname?.startsWith('/livelihood/placement') ? 'is-active' : ''}`}
            >
              Placement
            </Link>
            <Link
              href="/livelihood/enterprise"
              className={`filter-tab ${pathname?.startsWith('/livelihood/enterprise') ? 'is-active' : ''}`}
            >
              Enterprise
            </Link>
          </nav>
        )}

        {!isAdmin && (
          <div className="filter-controls">
            {showLocation && (
              <>
                <MultiSelect
                  label="State"
                  name="state_id"
                  value={filters.state_id}
                  options={locations}
                  emptyLabel="All states"
                  onChange={setField}
                />
                <MultiSelect
                  label="District"
                  name="district_id"
                  value={filters.district_id}
                  options={districts}
                  emptyLabel="All districts"
                  disabled={!filters.state_id}
                  onChange={setField}
                />
              </>
            )}

            {showCalendar && (
              <MultiSelect
                label={moduleName === 'overview' ? 'Health year' : 'Year'}
                name="year"
                value={filters.year}
                options={years.map((y) => ({ id: y, name: y }))}
                emptyLabel="All years"
                onChange={setField}
              />
            )}

            {showFy && (
              <MultiSelect
                label={fyLabel}
                name={moduleName === 'education' ? 'academic_year' : 'financial_year'}
                value={filters.financial_year || filters.academic_year}
                options={fyYears.map((fy) => ({ id: fy, name: fy }))}
                emptyLabel="All years"
                onChange={setField}
              />
            )}

            {moduleName === 'livelihood' && (
              <MultiSelect
                label="Month"
                name="month"
                value={filters.month}
                options={['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'].map((name) => ({ id: name, name }))}
                emptyLabel="All months"
                onChange={setField}
              />
            )}

            {showGender && (
              <MultiSelect
                label="Gender"
                name="gender"
                value={filters.gender}
                options={[{ id: 'F', name: 'Female' }, { id: 'M', name: 'Male' }]}
                emptyLabel="All"
                onChange={setField}
              />
            )}
          </div>
        )}

        <div className="filter-actions">
          {!isAdmin && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>
              Reset
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm filter-print"
            onClick={() => { printDashboard(); }}
            title="Print page"
          >
            <Printer size={16} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {!isAdmin && chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((chip) => (
            <button
              key={`${chip.key}-${chip.id}`}
              type="button"
              className="filter-chip"
              onClick={() => removeValue(chip.key, chip.id)}
            >
              {chip.label}
              <X size={12} weight="bold" />
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
