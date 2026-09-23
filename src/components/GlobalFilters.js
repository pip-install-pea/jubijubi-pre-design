'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Printer, X } from '@phosphor-icons/react';
import { currentCalendarYear, currentFinancialYear, financialYearList } from '@/lib/phpRegistry.js';
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
    gender: ''
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
      financial_year: fy
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
  for (const key of ['state_id', 'district_id', 'year', 'academic_year', 'financial_year', 'gender']) {
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
  return next;
}

function Field({ label, children }) {
  return (
    <label className="filter-field">
      <span className="sr-only">{label}</span>
      {children}
    </label>
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
      setFilters(next);
      applyRef.current?.(next);
    };
    window.addEventListener('app:filters:patch', onPatch);
    return () => window.removeEventListener('app:filters:patch', onPatch);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
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

  const clearKey = (key) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: '' };
      if (key === 'academic_year' || key === 'financial_year') {
        next.academic_year = '';
        next.financial_year = '';
      }
      if (key === 'state_id') {
        next.district_id = '';
        activeStateIdRef.current = '';
        setDistricts([]);
      }
      apply(next);
      return next;
    });
  };

  const handleReset = () => {
    const next = defaultsFor(moduleName);
    activeStateIdRef.current = '';
    setFilters(next);
    setDistricts([]);
    apply(next);
  };

  const stateName = locations.find((s) => String(s.id) === String(filters.state_id))?.name;
  const districtName = districts.find((d) => String(d.id) === String(filters.district_id))?.name;
  const chips = [];
  if (showLocation && stateName) chips.push({ key: 'state_id', label: stateName });
  if (showLocation && districtName) chips.push({ key: 'district_id', label: districtName });
  if (showGender && filters.gender) {
    chips.push({ key: 'gender', label: filters.gender === 'F' ? 'Female' : 'Male' });
  }

  const fyYears = financialYearList(8);
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
                <Field label="State">
                  <select name="state_id" value={filters.state_id} onChange={handleChange}>
                    <option value="">All states</option>
                    {locations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="District">
                  <select
                    name="district_id"
                    value={filters.district_id}
                    onChange={handleChange}
                    disabled={!filters.state_id}
                  >
                    <option value="">All districts</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {showCalendar && (
              <Field label={moduleName === 'overview' ? 'Health year' : 'Year'}>
                <select name="year" value={filters.year} onChange={handleChange}>
                  <option value="">All years</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
            )}

            {showFy && (
              <Field label={fyLabel}>
                <select
                  name={moduleName === 'education' ? 'academic_year' : 'financial_year'}
                  value={filters.financial_year || filters.academic_year}
                  onChange={handleChange}
                >
                  <option value="">All years</option>
                  {fyYears.map((fy) => (
                    <option key={fy} value={fy}>{fy}</option>
                  ))}
                </select>
              </Field>
            )}

            {showGender && (
              <Field label="Gender">
                <select name="gender" value={filters.gender} onChange={handleChange}>
                  <option value="">All</option>
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                </select>
              </Field>
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
              key={chip.key}
              type="button"
              className="filter-chip"
              onClick={() => clearKey(chip.key)}
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
