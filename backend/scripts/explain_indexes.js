// Replace with your 1M-row import id
const doc = db.imports.findOne({ _id: ObjectId("6ac1320b764b97c0b4aa090a") });
const col = db.getCollection(doc.rows_collection);
print("collection:", doc.rows_collection, "| indexed columns:", doc.indexed_columns);
print("indexes:", col.getIndexes().map((i) => i.name).join(", "));

function summarize(label, e) {
  const s = e.executionStats;
  print("\n== " + label);
  printjson({
    stages: JSON.stringify(e.queryPlanner.winningPlan).match(/"stage":"[A-Z_]+"/g),
    nReturned: s.nReturned,
    keysExamined: s.totalKeysExamined,
    docsExamined: s.totalDocsExamined,
    millis: s.executionTimeMillis,
  });
}

summarize("A. sort desc c2, with index",
  col.find().sort({ "d.c2": -1, _id: -1 }).limit(20).explain("executionStats"));

summarize("B. same sort, forced collection scan",
  col.find().sort({ "d.c2": -1, _id: -1 }).limit(20).hint({ $natural: 1 }).explain("executionStats"));

summarize("C. filter category = books, with index on c6",
  col.find({ "d.c6": "books" }).limit(20).explain("executionStats"));

summarize("D. sort asc c2, same index",
  col.find().sort({ "d.c2": 1, _id: 1 }).limit(20).explain("executionStats"));

summarize("E. mixed directions (index cannot serve it)",
  col.find().sort({ "d.c2": -1, _id: 1 }).limit(20).explain("executionStats"));