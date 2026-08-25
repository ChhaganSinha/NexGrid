# 📂 Row Expansion (Master-Detail Rows)

TableX supports accordion-style expandable rows to display rich nested master-detail sub-views, audit history, charts, or nested tables.

---

## Overview

When row expansion is enabled, TableX renders an expand/collapse toggle chevron `[ ❯ ]` column. Clicking a row's chevron expands a full-width sub-row containing custom content.

---

## React Usage

Provide `renderExpandedRow`:

```tsx
<TableX<Student>
  caption="Students"
  columns={columns}
  data={data}
  total={total}
  query={query}
  onQueryChange={setQuery}
  renderExpandedRow={(student) => (
    <div className="student-detail">
      <h4>Student Profile — #{student.id}</h4>
      <p>Department: {student.department}</p>
      <p>Scholarship Status: {student.scholarship ? "Awarded" : "None"}</p>
      <p>Enrollment Date: {student.enrolledAt}</p>
    </div>
  )}
/>
```

---

## Vanilla JavaScript Usage

```js
createTableX(container, {
  caption: "Students",
  columns: columns,
  data: data,
  total: 100,
  renderExpandedRow: (student) => {
    const div = document.createElement("div");
    div.innerHTML = `<strong>Details for ${student.name}:</strong> ID #${student.id}, Department: ${student.department}`;
    return div;
  },
});
```
