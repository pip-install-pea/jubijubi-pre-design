// JBF is confirming the final location list. Edit ONLY this constant to add/remove/move pins.
// lat/lon: OpenStreetMap (Nominatim) place nodes, rounded to 4 dp, checked against the SoI polygons (npm run geo:check).
// districtKey: SoI district key in public/geo/india_districts.geojson (config wins over point-in-polygon for border towns).
export const MAP_LOCATIONS = [
  // client-decided 5 (livelihood decks + E8.1), colours from the client sample
  { id: 'kapasan',   town: 'Kapasan',   state: 'Rajasthan',     districtKey: 'RJ-95',  lat: 24.8877, lon: 74.3123, color: '#F28E2B', status: 'client-decided', osm: 'node/245727745',  show: { livelihood: true,  education: true,  health: false } },
  { id: 'savli',     town: 'Savli',     state: 'Gujarat',       districtKey: 'GJ-461', lat: 22.5625, lon: 73.2231, color: '#4E79A7', status: 'client-decided', osm: 'node/245706963',  show: { livelihood: true,  education: true,  health: false } },
  { id: 'bharuch',   town: 'Bharuch',   state: 'Gujarat',       districtKey: 'GJ-442', lat: 21.7080, lon: 72.9957, color: '#9C6ADE', status: 'client-decided', osm: 'way/22826303',    show: { livelihood: true,  education: true,  health: false } },
  { id: 'gajraula',  town: 'Gajraula',  state: 'Uttar Pradesh', districtKey: 'UP-154', lat: 28.8361, lon: 78.2453, color: '#59A14F', status: 'client-decided', osm: 'node/1209127941', show: { livelihood: true,  education: true,  health: false } },
  { id: 'nanjangud', town: 'Nanjangud', state: 'Karnataka',     districtKey: 'KA-545', lat: 12.1187, lon: 76.6818, color: '#E15759', status: 'client-decided', osm: 'node/245602738',  show: { livelihood: true,  education: true,  health: false } },
  // other active locations: hidden until JBF confirms (client tracker row 4 / Edu-Health query)
  { id: 'nira',      town: 'Nira',      state: 'Maharashtra',   districtKey: 'MH-490', lat: 18.1002, lon: 74.2137, color: '#76B7B2', status: 'pending-jbf', osm: 'way/256573126',   show: { livelihood: false, education: false, health: false } },
  { id: 'roorkee',   town: 'Roorkee',   state: 'Uttarakhand',   districtKey: 'UK-50',  lat: 29.8693, lon: 77.8902, color: '#EDC948', status: 'pending-jbf', osm: 'node/4373395280', show: { livelihood: false, education: false, health: false } },
  { id: 'amroha',    town: 'Amroha',    state: 'Uttar Pradesh', districtKey: 'UP-154', lat: 28.7953, lon: 78.3436, color: '#B07AA1', status: 'pending-jbf', osm: 'relation/1958055', show: { livelihood: false, education: false, health: false } },
  { id: 'vilayat',   town: 'Vilayat',   state: 'Gujarat',       districtKey: 'GJ-442', lat: null,    lon: null,    color: '#FF9DA7', status: 'pending-jbf', osm: null,              show: { livelihood: false, education: false, health: false } }, // coordinates not found in OSM; JBF to supply
  { id: 'pune',      town: 'Pune',      state: 'Maharashtra',   districtKey: 'MH-490', lat: 18.5214, lon: 73.8545, color: '#9D7660', status: 'pending-jbf', osm: 'node/16174445',   show: { livelihood: false, education: false, health: false } },
  { id: 'mysuru',    town: 'Mysuru',    state: 'Karnataka',     districtKey: 'KA-545', lat: 12.3041, lon: 76.6530, color: '#BAB0AC', status: 'pending-jbf', osm: 'relation/19125269', show: { livelihood: false, education: false, health: false } },
  { id: 'bengaluru', town: 'Bengaluru', state: 'Karnataka',     districtKey: 'KA-525', lat: 12.9768, lon: 77.5901, color: '#8CD17D', status: 'pending-jbf', osm: 'relation/7902476', show: { livelihood: false, education: false, health: false } },
  { id: 'greater-noida', town: 'Greater Noida', state: 'Uttar Pradesh', districtKey: 'UP-144', lat: 28.4671, lon: 77.5138, color: '#499894', status: 'pending-jbf', osm: 'node/712869911', show: { livelihood: false, education: false, health: false } },
];
// How a pin click maps onto each dashboard's EXISTING geo filter values (lookup-table names).
// Proposed from the live lookup tables seen on 6 Oct; VERIFY each against skilltracking_state / skilltracking_district
// before use, and set null where the dashboard has no matching value (the pin then shows a tooltip only, no filter).
export const PIN_FILTERS = {
  livelihood: { kapasan: null, savli: { state: 'Gujarat', district: 'Savli' }, bharuch: { state: 'Gujarat', district: 'Bharuch' },
                gajraula: { state: 'Uttar Pradesh', district: 'Gajraula' }, nanjangud: { state: 'Karnataka', district: 'Mysuru' } },
  education: {}, // fill from the education location mapping on main (eduGeo) if it exists; otherwise leave empty
};
export const pinsFor = (dashboard) => MAP_LOCATIONS.filter((p) => p.show?.[dashboard]);
