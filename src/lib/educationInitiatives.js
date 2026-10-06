/** Client initiative names. Schools Working (3) and HP WOW (10) are not included. */
export const INITIATIVES = [
  {
    name: 'Digital and STEM Learning Program (21st century learning)',
    programs: [
      { id: '8', name: 'Edulab' },
      { id: '9', name: 'HP Clap' }
    ]
  },
  {
    name: 'Life Skills & Behavioral Transformation Program',
    programs: [
      { id: '4', name: 'Khusiyon ki Pathshala' },
      { id: '5', name: 'Khusiyon ki Pathshala 2.0' },
      { id: '14', name: 'Library on wheels' },
      { id: '6', name: 'Muskaan Activity', participations: true }
    ]
  },
  {
    name: 'Scholarship',
    programs: [
      { id: '13', name: 'Jubilant Pratibha Puraskar' }
    ]
  },
  {
    name: 'Youth Leadership Development program',
    programs: [
      { id: '7', name: 'Muskaan Fellowship' }
    ]
  }
];

export const INITIATIVE_PROGRAMS = INITIATIVES.flatMap((item) =>
  item.programs.map((program) => ({ ...program, initiative: item.name }))
);

/** Our School Network reference set (A9): five locations in four states. */
export const SCHOOL_NETWORK = [
  { place: 'Kapasan', state: 'Rajasthan' },
  { place: 'Savli', state: 'Gujarat' },
  { place: 'Bharuch', state: 'Gujarat' },
  { place: 'Gajraula', state: 'Uttar Pradesh' },
  { place: 'Nanjangud', state: 'Karnataka' }
];
