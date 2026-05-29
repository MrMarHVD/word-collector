// Seed the fixed set of study languages the product offers. These back the
// language picker shown during onboarding.

export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO predefined_languages (name)
    VALUES ('English'), ('Japanese'), ('Chinese'), ('Spanish'), ('French')
    ON CONFLICT (name) DO NOTHING;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM predefined_languages
    WHERE name IN ('English', 'Japanese', 'Chinese', 'Spanish', 'French');
  `);
};
