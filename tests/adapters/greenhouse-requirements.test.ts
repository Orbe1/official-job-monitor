// @vitest-environment node

import { requirementsFromGreenhouseContent } from "../../src/adapters/adapters/greenhouse-requirements";

describe("Greenhouse role requirement extraction", () => {
  it("preserves mandatory degree and graduation evidence from a role-specific section", () => {
    const content = [
      "<h2>What we look for:</h2>",
      "<ul>",
      "<li>Currently pursuing a BS/MS in Computer Science or a related engineering field.</li>",
      "<li>You will graduate in Fall 2027 or Spring 2028.</li>",
      "<li>Use SQL and Python to prototype and test technical products.</li>",
      "</ul>",
      "<h2>Preferred Qualifications</h2>",
      "<p>An MBA or business degree is preferred.</p>",
      "<h2>About Databricks</h2>",
      "<p>Our employees hold many different degrees.</p>",
    ].join("");

    expect(requirementsFromGreenhouseContent(content)).toEqual({
      requirements: [
        "Currently pursuing a BS/MS in Computer Science or a related engineering field.",
        "You will graduate in Fall 2027 or Spring 2028.",
        "Use SQL and Python to prototype and test technical products.",
      ],
      eligibility: "Currently pursuing a BS/MS in Computer Science or a related engineering field.",
      graduationRequirements: "You will graduate in Fall 2027 or Spring 2028.",
    });
  });

  it("preserves a PhD requirement without treating preferred or company copy as eligibility", () => {
    const content = [
      "&lt;h3&gt;Minimum Qualifications&lt;/h3&gt;",
      "&lt;h4&gt;Required:&lt;/h4&gt;",
      "&lt;ul&gt;&lt;li&gt;You are pursuing a PhD in Computer Science, Electrical Engineering, mathematics, physics, or a related field.&lt;/li&gt;",
      "&lt;li&gt;Deep learning research experience using PyTorch.&lt;/li&gt;&lt;/ul&gt;",
      "&lt;h3&gt;Bonus points&lt;/h3&gt;",
      "&lt;p&gt;An additional master's degree is preferred.&lt;/p&gt;",
    ].join("");

    expect(requirementsFromGreenhouseContent(content)).toEqual({
      requirements: [
        "You are pursuing a PhD in Computer Science, Electrical Engineering, mathematics, physics, or a related field.",
        "Deep learning research experience using PyTorch.",
      ],
      eligibility: "You are pursuing a PhD in Computer Science, Electrical Engineering, mathematics, physics, or a related field.",
      graduationRequirements: null,
    });
  });
});
