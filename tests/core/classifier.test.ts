// @vitest-environment node
import {
  classifyPosting,
  isPossibleStudentOrEarlyCareerPosting,
} from "../../src/adapters/classifier";

describe("deterministic role classifier", () => {
  it("classifies technical internships without depending on exact title", () => {
    const result = classifyPosting({
      title: "Campus Program — Platform Engineering",
      employmentType: "Intern",
      department: "Engineering",
      descriptionText: "Current students build distributed cloud infrastructure.",
    });
    expect(result).toMatchObject({ relevant: true, audience: "internship", technicalCategory: "infrastructure", reviewRequired: false });
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("recognizes new-college terminology and rejects senior roles", () => {
    expect(classifyPosting({ title: "Software Engineer I", employmentType: "Full time", department: "Engineering", descriptionText: "Early career program." }).audience).toBe("new_grad");
    expect(classifyPosting({ title: "Staff Software Engineer", employmentType: "Full time", department: "Engineering", descriptionText: "Requires 8+ years of experience." })).toMatchObject({ relevant: false, audience: "irrelevant" });
  });

  it("does not mistake incidental internship experience for the role's audience", () => {
    const result = classifyPosting({
      title: "Data Scientist, Core Data - PhD (2026)",
      employmentType: null,
      department: "Early Career",
      descriptionText: "Apply machine learning to product problems. Prior exposure through research or internships is helpful.",
    });

    expect(result).toMatchObject({
      relevant: true,
      audience: "new_grad",
      technicalCategory: "data_science",
      reviewRequired: false,
    });
  });

  it("gives Data Scientist and Data Engineer titles priority over department prose", () => {
    expect(classifyPosting({
      title: "Data Scientist, Product Analytics",
      employmentType: "Full time",
      department: "Machine Learning Engineering",
      descriptionText: "Early career role building production data pipelines.",
    })).toMatchObject({ technicalCategory: "data_science" });

    expect(classifyPosting({
      title: "Data Engineer, Experimentation",
      employmentType: "Full time",
      department: "Machine Learning and Data Science",
      descriptionText: "Early career role training predictive models.",
    })).toMatchObject({ technicalCategory: "data" });
  });

  it("includes product-management student roles only with a mandatory technical degree and hands-on evidence", () => {
    const newGrad = classifyPosting({
      title: "Associate Product Manager, New Grad (2027 Start)",
      employmentType: "Full time",
      department: "University Recruiting",
      descriptionText: `The impact you will have
Prototype and test early ideas before the team commits to a build.
Work with engineers and designers to ship features on the platform.
What we look for
You will graduate in Fall 2026 or Spring 2027 with a bachelor's or master's degree in computer science or a related engineering field.
You have first-hand experience with SQL and Python.
Pay Range Transparency
Company compensation boilerplate.`,
    });
    const internship = classifyPosting({
      title: "Product Management Intern (Summer 2027)",
      employmentType: "Internship",
      department: "Product",
      descriptionText: `The impact you will have
Prototype and test ideas, then build and ship platform features with engineers.
What we look for
Pursuing a bachelor's or master's in computer science or a related engineering field, graduating in Fall 2027 or Spring 2028.
Hands-on experience with SQL and/or Python.
About Databricks
We are a data and AI company.`,
    });

    expect(newGrad).toMatchObject({
      relevant: true,
      audience: "new_grad",
      technicalCategory: "product_management",
      reviewRequired: false,
    });
    expect(internship).toMatchObject({
      relevant: true,
      audience: "internship",
      technicalCategory: "product_management",
      reviewRequired: false,
    });
    expect(newGrad.reasons).toContain("Mandatory technical degree and hands-on technical product evidence");
  });

  it("keeps the technical-product override narrow", () => {
    const commonRole = `The impact you will have
Prototype, test, build, and ship platform features.
What we look for
Hands-on experience with SQL and Python.`;
    const cases = [
      {
        title: "Product Management Intern",
        employmentType: "Internship",
        descriptionText: `${commonRole}\nPursuing a bachelor's degree in business or computer science.`,
      },
      {
        title: "Product Management Intern",
        employmentType: "Internship",
        descriptionText: `${commonRole}\nA computer science degree is preferred.`,
      },
      {
        title: "Product Management Intern",
        employmentType: "Internship",
        descriptionText: `We build AI infrastructure with Python and SQL.
What we look for
Pursuing a bachelor's degree in computer science.
About the company
Build, prototype, and ship appears only in company boilerplate.`,
      },
      {
        title: "Associate Product Manager",
        employmentType: "Internship",
        descriptionText: `${commonRole}\nPursuing a bachelor's degree in computer science.`,
      },
      {
        title: "Senior Product Manager Intern",
        employmentType: "Internship",
        descriptionText: `${commonRole}\nPursuing a bachelor's degree in computer science.`,
      },
    ];

    for (const posting of cases) {
      expect(classifyPosting({
        ...posting,
        department: "Product",
      })).toMatchObject({ relevant: false, audience: "irrelevant", reviewRequired: false });
    }
  });

  it("recognizes ML research-scientist identity but routes a PhD-only internship to review", () => {
    const phdIntern = classifyPosting({
      title: "PhD GenAI Research Scientist Intern",
      employmentType: "Internship",
      department: "University Recruiting",
      descriptionText: `Job description
Design and evaluate new methods for adapting LLMs and AI systems.
Your qualifications and qualities
Research experience in deep learning.
Pursuing a PhD in computer science or a related field.
Proficient software engineering skills, including PyTorch.
Pay Range Transparency
Compensation details.`,
    });
    const bachelorEligible = classifyPosting({
      title: "Machine Learning Research Scientist Intern",
      employmentType: "Internship",
      department: "Research",
      descriptionText: `Job description
Develop and test deep-learning models in PyTorch.
Qualifications
Pursuing a bachelor's or master's degree in computer science.`,
    });
    const nonComputational = classifyPosting({
      title: "Research Scientist Intern",
      employmentType: "Internship",
      department: "Biology",
      descriptionText: `Job description
Conduct wet-lab assays and prepare biological samples.
Qualifications
Pursuing a bachelor's degree in biology.`,
    });

    expect(phdIntern).toMatchObject({
      relevant: false,
      audience: "internship",
      technicalCategory: "machine_learning",
      reviewRequired: true,
    });
    expect(phdIntern.reasons).toEqual([
      "Technical internship is explicitly PhD-only; review against undergraduate scope",
    ]);
    expect(bachelorEligible).toMatchObject({
      relevant: true,
      audience: "internship",
      technicalCategory: "machine_learning",
      reviewRequired: false,
    });
    expect(nonComputational).toMatchObject({
      relevant: false,
      audience: "irrelevant",
      reviewRequired: false,
    });
  });

  it("does not treat a completed PhD requirement as student or new-grad audience", () => {
    for (const location of [
      "Mountain View, California; San Francisco, California",
      "Bellevue, Washington; Seattle, Washington",
    ]) {
      const posting = {
        title: "Systems PhD - Software Engineer",
        employmentType: "Full time",
        department: "Engineering - Pipeline",
        descriptionText: `Job description
Design and implement database and distributed systems in ${location}.
What we look for
PhD in databases or systems.
A passion for database systems and performance optimization.`,
      };
      const result = classifyPosting(posting);

      expect(isPossibleStudentOrEarlyCareerPosting(posting)).toBe(true);
      expect(result).toMatchObject({
        relevant: false,
        audience: "irrelevant",
        technicalCategory: "software",
        reviewRequired: false,
        reasons: ["Technical role lacks student or early-career evidence"],
      });
    }
  });

  it("keeps an explicit PhD new-grad role included rather than applying the internship review rule", () => {
    expect(classifyPosting({
      title: "Data Scientist, Core Data - PhD (2026)",
      employmentType: "Full time",
      department: "Early Career",
      descriptionText: `Job description
Build statistical and machine-learning models.
Qualifications
Pursuing a PhD in computer science, statistics, or a related field.`,
    })).toMatchObject({
      relevant: true,
      audience: "new_grad",
      technicalCategory: "data_science",
      reviewRequired: false,
    });
  });

  it("lets explicit nontechnical titles override generic technical prose", () => {
    const brandIntern = classifyPosting({
      title: "Brand Social Media Intern",
      employmentType: "Intern",
      department: "Marketing",
      descriptionText: "Use data and technical tools to explain cloud security products.",
    });
    const operationsIntern = classifyPosting({
      title: "EIAM Business Enablement & Operations Intern",
      employmentType: "Intern",
      department: "Engineering",
      descriptionText: "Partner with engineers supporting identity infrastructure and distributed systems.",
    });

    expect(brandIntern).toMatchObject({ relevant: false, audience: "irrelevant", reviewRequired: false });
    expect(operationsIntern).toMatchObject({ relevant: false, audience: "irrelevant", reviewRequired: false });
  });

  it("includes a network-strategy internship when role-specific evidence is technical", () => {
    const result = classifyPosting({
      title: "Network Strategy Intern",
      employmentType: "Intern",
      department: "Strategy",
      descriptionText: `About the Role
Responsibilities
Manage and track peering and transit relationships and support acquisition of network capacity.
Conduct data analysis related to network growth and infrastructure.
Qualifications
Current bachelor's student. Basic SQL or Python and knowledge of IP networking and data centers.`,
    });

    expect(result).toMatchObject({
      relevant: true,
      audience: "internship",
      technicalCategory: "networking",
      reviewRequired: false,
    });
    expect(classifyPosting({
      title: "Software Engineer Intern",
      employmentType: "Intern",
      department: "Engineering",
      descriptionText: "Build distributed cloud infrastructure and ship projects with autonomy.",
    })).toMatchObject({
      relevant: true,
      audience: "internship",
      technicalCategory: "software",
      reviewRequired: false,
    });
  });

  it("includes technical-support internships without treating coworkers as candidate seniority", () => {
    const result = classifyPosting({
      title: "Technical Support Engineer Intern",
      employmentType: "Intern",
      department: "Customer Support",
      descriptionText: `What You'll Do
Collaborate with senior engineers to troubleshoot customer issues.
Responsibilities
Test releases, report bugs, and write technical runbooks.
Qualifications
Currently pursuing a Computer Science degree. Experience with Linux, Bash, Python, DNS, TLS, HTTP, and BGP.`,
    });

    expect(result).toMatchObject({
      relevant: true,
      audience: "internship",
      technicalCategory: "support",
      reviewRequired: false,
    });
  });

  it("uses explicit title or experience requirements for seniority", () => {
    expect(classifyPosting({
      title: "Senior Software Engineer Intern",
      employmentType: "Intern",
      department: "Engineering",
      descriptionText: "Build APIs.",
    })).toMatchObject({ relevant: false, audience: "irrelevant" });

    expect(classifyPosting({
      title: "Software Engineer Intern",
      employmentType: "Intern",
      department: "Engineering",
      descriptionText: "Qualifications\nRequires 5+ years of professional software engineering experience.",
    })).toMatchObject({ relevant: false, audience: "irrelevant" });
  });

  it("requires role-specific evidence instead of company boilerplate", () => {
    const companyBoilerplate = "We build cloud security, AI infrastructure, distributed systems, hardware, and autonomous technology.";
    const cases = [
      { title: "Public Policy Intern", department: "Legal, Policy, Trust & Safety", descriptionText: `${companyBoilerplate}\nAbout the Role\nAnalyze legislation and prepare policy materials.` },
      { title: "Marketing Events and Campaigns Intern", department: "Marketing", descriptionText: `${companyBoilerplate}\nResponsibilities\nCoordinate events and marketing campaigns.` },
      { title: "Sales Project Manager Intern (AI Innovation)", department: "Sales", descriptionText: `${companyBoilerplate}\nResponsibilities\nTrack sales projects and document operational processes.` },
      { title: "Brand Social Media Intern", department: "Marketing", descriptionText: `${companyBoilerplate}\nResponsibilities\nCreate social content and manage campaign calendars.` },
    ];

    for (const posting of cases) {
      expect(classifyPosting({
        ...posting,
        employmentType: "Intern",
      })).toMatchObject({ relevant: false, audience: "irrelevant", reviewRequired: false });
    }
  });

  it("distinguishes a technical AI-builder internship from a sales project role", () => {
    expect(classifyPosting({
      title: "AI Transformation Intern – Global Customer Engineering, Service Sales",
      employmentType: "Intern",
      department: "University",
      descriptionText: `About the Role
The AI Builder Intern works with engineers on developer-platform projects.
Responsibilities
Develop LLM and RAG prototypes, integrate REST APIs, and prepare data for model training.
Qualifications
Current Computer Science student with Python or JavaScript experience.`,
    })).toMatchObject({
      relevant: true,
      audience: "internship",
      technicalCategory: "machine_learning",
      reviewRequired: false,
    });

    expect(classifyPosting({
      title: "Sales Project Manager Intern (AI Innovation)",
      employmentType: "Intern",
      department: "University",
      descriptionText: "Responsibilities\nTrack sales projects, document processes, and evaluate no-code AI tools.",
    })).toMatchObject({ relevant: false, audience: "irrelevant", reviewRequired: false });
  });

  it("routes strongly technical responsibilities behind an ambiguous title to review", () => {
    expect(classifyPosting({
      title: "Professional Services Intern",
      employmentType: "Intern",
      department: "University",
      descriptionText: `About the Role
Responsibilities
Build models, develop LLM and RAG prototypes, fine-tune them, and turn requirements into technical MVPs.
Qualifications
Study business, project management, or a technical field with an AI component.`,
    })).toMatchObject({
      relevant: false,
      audience: "ambiguous",
      technicalCategory: "machine_learning",
      reviewRequired: true,
    });
  });

  it("keeps genuine autonomy roles in robotics while ignoring general autonomy prose", () => {
    expect(classifyPosting({
      title: "Autonomy Software Engineering Intern",
      employmentType: "Intern",
      department: "Autonomous Systems",
      descriptionText: "Develop motion-planning software for autonomous vehicles.",
    })).toMatchObject({ technicalCategory: "robotics", relevant: true });

    expect(classifyPosting({
      title: "Software Engineer Intern",
      employmentType: "Intern",
      department: "Engineering",
      descriptionText: "Own a project with autonomy and support from a mentor.",
    })).toMatchObject({ technicalCategory: "software", relevant: true });
  });

  it("does not infer new-grad identity from incidental description prose", () => {
    expect(classifyPosting({
      title: "Backend Software Engineer",
      employmentType: "Full time",
      department: "Engineering",
      descriptionText: "Mentor teammates in our early career program.",
    })).toMatchObject({ relevant: false, audience: "irrelevant", reviewRequired: false });
  });

  it("makes ambiguous low-experience roles reviewable", () => {
    expect(classifyPosting({ title: "Backend Software Engineer", employmentType: "Full time", department: "Engineering", descriptionText: "0 to 2 years of experience building APIs." })).toMatchObject({ relevant: false, audience: "ambiguous", reviewRequired: true });
  });

  it("does not admit nontechnical student roles", () => {
    expect(classifyPosting({ title: "Sales Intern", employmentType: "Intern", department: "Sales", descriptionText: "Student internship." }).relevant).toBe(false);
  });
});
