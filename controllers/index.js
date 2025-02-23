const { Parser } = require("json2csv");
const fs = require("fs").promises;
const db = require("../firebase");


const submitMatchScoutForm = async (req, res) => {
  try {
    const { teamNumber } = req.params;
    const { username, matchNumber, ...formFields } = req.body;

    // Create PST timestamp
    const pstTimestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const teamDocRef = db.collection("matchscout").doc(teamNumber);
    const teamDoc = await teamDocRef.get();

    // Add timestamp to form data
    const formDataWithTimestamp = {
      ...formFields,
      submissionTimestamp: pstTimestamp,
    };

    if (teamDoc.exists) {
      await teamDocRef.update({
        [`match${matchNumber}`]: {
          [username]: formDataWithTimestamp,
        },
      });
    } else {
      const initialData = {
        [`match${matchNumber}`]: {
          [username]: formDataWithTimestamp,
        },
      };
      await teamDocRef.set(initialData);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const fetchMatchButtonStatus = async (req, res) => {
  try {
    const { teamNumber, matchNumber } = req.params;

    const buttonRef = db
      .collection("buttons")
      .doc(teamNumber + "-" + matchNumber);
    const buttonDoc = await buttonRef.get();

    if (!buttonDoc.exists) {
      return res.status(200).json({
        status: "avaiable",
        scoutedBy: null,
      });
    }

    const data = buttonDoc.data();
    return res.status(200).json({
      status: data.status,
      scoutedBy: data.scoutedBy,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
};

const toggleMatchButtonStatus = async (req, res) => {
  try {
    const { teamNumber, matchNumber } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required",
      });
    }

    const buttonRef = db
      .collection("buttons")
      .doc(`${teamNumber}-${matchNumber}`);
    const buttonDoc = await buttonRef.get();
    let newStatus;

    if (!buttonDoc.exists) {
      newStatus = "working";
      await buttonRef.set({
        status: newStatus,
        scoutedBy: username,
        startTime: new Date().toISOString(),
      });
    } else {
      const data = buttonDoc.data();
      // Only allow the same user who started scouting to change it back
      if (data.status === "working" && data.scoutedBy !== username) {
        return res.status(403).json({
          success: false,
          error: "This match is being scouted by someone else",
        });
      }
      newStatus = data.status === "avaiable" ? "working" : "avaiable";
      await buttonRef.update({
        status: newStatus,
        scoutedBy: newStatus === "working" ? username : null,
        startTime: newStatus === "working" ? new Date().toISOString() : null,
      });
    }

    return res.status(200).json({
      status: newStatus,
      scoutedBy: newStatus === "working" ? username : null,
    });
  } catch (error) {
    console.error("Error in toggleMatchButtonStatus:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error.message,
    });
  }
};

const fetchMatchScoutData = async (req, res) => {
  try {
    const matchScoutCollection = db.collection("matchscout");
    const matchScoutDocuments = await matchScoutCollection.listDocuments();
    const matchScoutData = await getMatchScoutData(matchScoutDocuments);
    res.json(matchScoutData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const fetchPitScoutData = async (req, res) => {
  try {
    const pitScoutCollection = db.collection("pitscout");

    const pitScoutDocuments = await pitScoutCollection.listDocuments();
    const pitScoutData = [];

    for (const document of pitScoutDocuments) {
      const documentRef = await document.get();
      const pitscout = documentRef.data().pitscout;

      for (const submissionKey in pitscout) {
        const submissionData = pitscout[submissionKey];
        const username = Object.keys(submissionData)[0];
        pitScoutData.push({
          teamNumber: document.id,
          submissionKey: submissionKey,
          ...submissionData[username],
          username: username,
        });
      }
    }

    res.json(pitScoutData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const fetchAllScoutInstances = async (req, res) => {
  try {
    const pitScoutCollection = db.collection("pitscout");
    const matchScoutCollection = db.collection("matchscout");

    const pitScoutDocuments = await pitScoutCollection.listDocuments();
    const matchScoutDocuments = await matchScoutCollection.listDocuments();

    let pitScoutInstances = [];
    let matchScoutInstances = [];

    for (const document of pitScoutDocuments) {
      const documentRef = await document.get();
      const pitscout = documentRef.data().pitscout;

      for (const submissionKey in pitscout) {
        const submissionData = pitscout[submissionKey];
        const username = Object.keys(submissionData)[0];
        pitScoutInstances.push({
          teamNumber: document.id,
          submissionKey,
          ...submissionData[username],
          username,
          scoutType: "pitscout",
        });
      }
    }

    for (const document of matchScoutDocuments) {
      const documentRef = await document.get();
      const matchscout = documentRef.data();

      const autoscout = matchscout.autoscout || {};
      const teleopscout = matchscout.teleopscout || {};

      const checkScoutInstances = (scoutData, scoutType) => {
        for (const submissionKey in scoutData) {
          const submissionData = scoutData[submissionKey];
          const username = Object.keys(submissionData)[0];
          matchScoutInstances.push({
            teamNumber: document.id,
            submissionKey,
            ...submissionData[username],
            username,
            scoutType,
          });
        }
      };

      checkScoutInstances(autoscout, "autoscout");
      checkScoutInstances(teleopscout, "teleopscout");
    }

    res.json({ pitScoutInstances, matchScoutInstances });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

const convertMatchScoutToCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("matchscout").get();
    const records = [];

    for (const doc of snapshot.docs) {
      const teamNumber = doc.id;
      const teamData = doc.data();

      Object.entries(teamData).forEach(([matchKey, matchData]) => {
        Object.entries(matchData).forEach(([username, scoutData]) => {
          records.push({
            teamNumber,
            matchNumber: matchKey.replace("match", ""),
            username,
            // Auto
            autoL1Scores: scoutData.autoL1Scores || 0,
            autoL2Scores: scoutData.autoL2Scores || 0,
            autoL3Scores: scoutData.autoL3Scores || 0,
            autoL4Scores: scoutData.autoL4Scores || 0,
            autoL1Attempts: scoutData.autoL1Attempts || 0,
            autoL2Attempts: scoutData.autoL2Attempts || 0,
            autoL3Attempts: scoutData.autoL3Attempts || 0,
            autoL4Attempts: scoutData.autoL4Attempts || 0,
            autoProcessorAlgaeScores: scoutData.autoProcessorAlgaeScores || 0,
            autoProcessorAlgaeAttempts:
              scoutData.autoProcessorAlgaeAttempts || 0,
            autoNetAlgaeScores: scoutData.autoNetAlgaeScores || 0,
            autoNetAlgaeAttempts: scoutData.autoNetAlgaeAttempts || 0,
            leftStartingZone: scoutData.leftStartingZone || "No",
            // Teleop
            teleopL1Scores: scoutData.teleopL1Scores || 0,
            teleopL2Scores: scoutData.teleopL2Scores || 0,
            teleopL3Scores: scoutData.teleopL3Scores || 0,
            teleopL4Scores: scoutData.teleopL4Scores || 0,
            teleopL1Attempts: scoutData.teleopL1Attempts || 0,
            teleopL2Attempts: scoutData.teleopL2Attempts || 0,
            teleopL3Attempts: scoutData.teleopL3Attempts || 0,
            teleopL4Attempts: scoutData.teleopL4Attempts || 0,
            teleopProcessorAlgaeScores:
              scoutData.teleopProcessorAlgaeScores || 0,
            teleopProcessorAlgaeAttempts:
              scoutData.teleopProcessorAlgaeAttempts || 0,
            teleopNetAlgaeScores: scoutData.teleopNetAlgaeScores || 0,
            teleopNetAlgaeAttempts: scoutData.teleopNetAlgaeAttempts || 0,
            // Endgame
            climbLevel: scoutData.climbLevel || "",
            climbSuccess: scoutData.climbSuccess || "No",
            climbAttemptTime: scoutData.climbAttemptTime || "",
            // Ratings and Comments
            robotSpeed: scoutData.robotSpeed || "",
            defenseRating: scoutData.defenseRating || "No Defense",
            climbComments: scoutData.climbComments || "",
            generalComments: scoutData.generalComments || "",
          });
        });
      });
    }

    if (records.length === 0) {
      return res.status(404).json({ error: "No scouting data found" });
    }

    // Define fields in the exact order you want them in the CSV
    const fields = [
      "teamNumber",
      "matchNumber",
      "autoL1Scores",
      "autoL2Scores",
      "autoL3Scores",
      "autoL4Scores",
      "autoL1Attempts",
      "autoL2Attempts",
      "autoL3Attempts",
      "autoL4Attempts",
      "autoProcessorAlgaeScores",
      "autoProcessorAlgaeAttempts",
      "autoNetAlgaeScores",
      "autoNetAlgaeAttempts",
      "leftStartingZone",
      "teleopL1Scores",
      "teleopL2Scores",
      "teleopL3Scores",
      "teleopL4Scores",
      "teleopL1Attempts",
      "teleopL2Attempts",
      "teleopL3Attempts",
      "teleopL4Attempts",
      "teleopProcessorAlgaeScores",
      "teleopProcessorAlgaeAttempts",
      "teleopNetAlgaeScores",
      "teleopNetAlgaeAttempts",
      "climbLevel",
      "climbSuccess",
      "climbAttemptTime",
      "climbComments",
      "robotSpeed",
      "defenseRating",
      "generalComments",
      "username",
      "submissionTimestamp",
    ];

    const json2csvParser = new Parser({
      fields,
      defaultValue: "0",
    });

    const csv = json2csvParser.parse(records);

    // Save CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `matchscout_${timestamp}.csv`;
    const filePath = `./exports/${fileName}`;

    await fs.mkdir("./exports", { recursive: true });
    await fs.writeFile(filePath, csv);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.sendFile(filePath, { root: "." });
  } catch (error) {
    console.error("Error converting to CSV:", error);
    res.status(500).json({ error: "Failed to convert data to CSV" });
  }
};

const fetchAllMatchScoutButtonStatuses = async (req, res) => {
  try {
    const { matchNumber } = req.params;
    const buttonStatuses = {};

    const buttonsRef = db.collection("buttons");
    const snapshot = await buttonsRef
      .where("matchNumber", "==", matchNumber)
      .get();

    snapshot.forEach((doc) => {
      const teamNumber = doc.id.split("-")[0];
      const data = doc.data();
      buttonStatuses[teamNumber] = {
        status: data.status,
        scoutedBy: data.scoutedBy,
      };
    });

    return res.status(200).json({
      success: true,
      statuses: buttonStatuses,
    });
  } catch (error) {
    console.error("Error getting match statuses:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};


module.exports = {
    fetchAllMatchScoutButtonStatuses,
    submitMatchScoutForm,
    fetchMatchButtonStatus,
    toggleMatchButtonStatus,
    fetchMatchScoutData,
    fetchPitScoutData,
    fetchAllScoutInstances,
    convertMatchScoutToCSV
}