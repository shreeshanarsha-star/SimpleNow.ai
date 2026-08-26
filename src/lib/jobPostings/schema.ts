// Builds a Google-for-Jobs-compliant JobPosting JSON-LD block. Ported from
// the old askshree-app repo's lib/jobPostingSchema.js. Deliberately omits
// baseSalary (ctc_budget stays free-text only) and addressCountry (location
// stays free-text only) — a malformed typed field in either makes Google
// reject the ENTIRE JobPosting block, not just that field. This happened in
// production on the old site for a Europe posting; keeping these two
// fields untyped avoids the whole class of bug.
export interface JobPostingForSchema {
  title: string;
  company: string | null;
  location: string | null;
  description: string;
  created_at: string;
  expires_at: string | null;
  employment_type: string | null;
}

export function buildJobPostingSchema(posting: JobPostingForSchema): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: posting.title,
    description: posting.description,
    datePosted: posting.created_at,
    hiringOrganization: {
      "@type": "Organization",
      name: posting.company || "Confidential",
    },
  };

  if (posting.expires_at) {
    schema.validThrough = posting.expires_at;
  }

  if (posting.employment_type) {
    schema.employmentType = posting.employment_type.toUpperCase().replace(/[\s-]+/g, "_");
  }

  if (posting.location) {
    schema.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: posting.location,
      },
    };
  } else {
    schema.jobLocationType = "TELECOMMUTE";
  }

  return schema;
}
