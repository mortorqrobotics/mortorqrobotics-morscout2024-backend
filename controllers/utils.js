const excel = require("xlsx");

const getMatchScoutData = async (documents) => {
  let matchScoutData = [];

  for (const document of documents) {
    const documentRef = await document.get();
    const data = documentRef.data();

    // Iterate through all fields that start with "match"
    for (const [key, matchData] of Object.entries(data)) {
      if (key.startsWith("match")) {
        const username = Object.keys(matchData)[0];
        matchScoutData.push({
          teamNumber: document.id,
          matchNumber: key.replace("match", ""), // Extract match number
          ...matchData[username],
          username: username,
        });
      }
    }
  }

  // Sort by team number and match number
  matchScoutData.sort((a, b) => {
    if (a.teamNumber !== b.teamNumber) {
      return a.teamNumber.localeCompare(b.teamNumber);
    }
    return parseInt(a.matchNumber) - parseInt(b.matchNumber);
  });

  return matchScoutData;
};

const downloadExcel = (data, filename) => {
  const rearrangedData = data.map((entry) => {
    const { username, ...rest } = entry;
    const { submissionKey, ...fieldsExceptSubmissionKey } = rest;
    return { username, ...fieldsExceptSubmissionKey, submissionKey };
  });

  rearrangedData.sort((a, b) => {
    if (a.teamNumber !== b.teamNumber)
      return a.teamNumber.localeCompare(b.teamNumber);
    return a.username.localeCompare(b.username);
  });

  const ws = excel.utils.json_to_sheet(rearrangedData);
  const wb = excel.utils.book_new();
  excel.utils.book_append_sheet(wb, ws, "Sheet 1");
  excel.writeFile(wb, filename);
};

module.exports = {
    getMatchScoutData,
    downloadExcel
}