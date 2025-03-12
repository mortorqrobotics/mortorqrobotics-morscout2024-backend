const { Parser } = require("json2csv");
const fs = require("fs").promises;
const db = require("../firebase");
const { getMatchScoutData } = require("./utils");


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
    const snapshot = await matchScoutCollection.get();
    const matchScoutData = [];

    snapshot.forEach((doc) => {
      const teamNumber = doc.id;
      const teamData = doc.data();

      Object.entries(teamData).forEach(([matchKey, matchData]) => {
        if (matchKey.startsWith('match')) {
          const matchNumber = matchKey.replace('match', '');
          const username = Object.keys(matchData)[0];
          const scoutData = matchData[username];
          
          matchScoutData.push({
            teamNumber,
            matchNumber,
            username,
            ...scoutData
          });
        }
      });
    });

    // Sort by team number and match number
    matchScoutData.sort((a, b) => {
      if (a.teamNumber !== b.teamNumber) {
        return a.teamNumber.localeCompare(b.teamNumber);
      }
      return parseInt(a.matchNumber) - parseInt(b.matchNumber);
    });

    res.status(200).json(matchScoutData);
  } catch (error) {
    console.error("Error fetching match scout data:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error",
      details: error.message 
    });
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

    snapshot.forEach((doc) => {
      const teamNumber = doc.id;
      const teamData = doc.data();

      // Iterate through match data
      Object.entries(teamData).forEach(([matchKey, matchData]) => {
        if (matchKey.startsWith('match')) {
          const matchNumber = matchKey.replace('match', '');
          
          // Get the first (and only) username key
          const username = Object.keys(matchData)[0];
          const scoutData = matchData[username];

          // Create record with all fields
          records.push({
            teamNumber,
            matchNumber,
            username,
            submissionTimestamp: scoutData.submissionTimestamp || '',
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
            autoProcessorAlgaeAttempts: scoutData.autoProcessorAlgaeAttempts || 0,
            autoNetAlgaeScores: scoutData.autoNetAlgaeScores || 0,
            autoNetAlgaeAttempts: scoutData.autoNetAlgaeAttempts || 0,
            leftStartingZone: scoutData.leftStartingZone || 'No',
            // Teleop
            teleopL1Scores: scoutData.teleopL1Scores || 0,
            teleopL2Scores: scoutData.teleopL2Scores || 0,
            teleopL3Scores: scoutData.teleopL3Scores || 0,
            teleopL4Scores: scoutData.teleopL4Scores || 0,
            teleopL1Attempts: scoutData.teleopL1Attempts || 0,
            teleopL2Attempts: scoutData.teleopL2Attempts || 0,
            teleopL3Attempts: scoutData.teleopL3Attempts || 0,
            teleopL4Attempts: scoutData.teleopL4Attempts || 0,
            teleopProcessorAlgaeScores: scoutData.teleopProcessorAlgaeScores || 0,
            teleopProcessorAlgaeAttempts: scoutData.teleopProcessorAlgaeAttempts || 0,
            teleopNetAlgaeScores: scoutData.teleopNetAlgaeScores || 0,
            teleopNetAlgaeAttempts: scoutData.teleopNetAlgaeAttempts || 0,
            // Endgame
            climbLevel: scoutData.climbLevel || 'None',
            climbSuccess: scoutData.climbSuccess || 'No',
            climbAttemptTime: scoutData.climbAttemptTime || 'None',
            // Comments
            climbComments: scoutData.climbComments || '',
            robotSpeed: scoutData.robotSpeed || 'None',
            generalComments: scoutData.generalComments || ''
          });
        }
      });
    });

    if (records.length === 0) {
      return res.status(404).json({ error: "No scouting data found" });
    }

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=matchscout_data.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error("Error converting to CSV:", error);
    res.status(500).json({ error: "Failed to convert data to CSV", details: error.message });
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

const convertPitScoutToCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("pitscout").get();
    const records = [];

    snapshot.forEach((doc) => {
      const teamNumber = doc.id;
      const teamData = doc.data();

      if (teamData.pitscout) {
        Object.entries(teamData.pitscout).forEach(([submissionKey, submissionData]) => {
          const username = Object.keys(submissionData)[0];
          const scoutData = submissionData[username];

          records.push({
            teamNumber,
            username,
            submissionTimestamp: scoutData.submissionTimestamp || '',
            // Robot Specifications
            robotWeight: scoutData.robotWeight || '',
            frameSize: scoutData.frameSize || '',
            drivetrain: scoutData.drivetrain || '',
            
            // Auto Capabilities
            auto: scoutData.auto || '',
            scoringPositionAuto: scoutData.scoringPositionAuto || '',
            autoNotesScored: scoutData.autoNotesScored || '',
            
            // Teleop Capabilities
            scoringPosition: scoutData.scoringPosition || '',
            estimatedCycleTime: scoutData.estimatedCycleTime || '',
            pickupFromFloor: scoutData.pickupFromFloor || '',
            
            // Climb
            climb: scoutData.climb || '',
            climbTime: scoutData.climbTime || '',
            
            // Additional Info
            additionalComments: scoutData.additionalComments || ''
          });
        });
      }
    });

    if (records.length === 0) {
      return res.status(404).json({ error: "No pit scout data found" });
    }

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=pitscout_data.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error("Error converting to CSV:", error);
    res.status(500).json({ error: "Failed to convert data to CSV", details: error.message });
  }
};

const submitPitScoutForm = async (req, res) => {
  try {
    const { teamNumber } = req.params;
    const { username, ...formFields } = req.body;

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

    const teamDocRef = db.collection("pitscout").doc(teamNumber);
    const teamDoc = await teamDocRef.get();

    // Add timestamp to form data
    const formDataWithTimestamp = {
      ...formFields,
      submissionTimestamp: pstTimestamp,
    };

    if (teamDoc.exists) {
      // Add new submission
      await teamDocRef.update({
        [`pitscout.submission${Date.now()}`]: {
          [username]: formDataWithTimestamp,
        },
      });
    } else {
      // Create new document with first submission
      const initialData = {
        pitscout: {
          [`submission${Date.now()}`]: {
            [username]: formDataWithTimestamp,
          },
        },
      };
      await teamDocRef.set(initialData);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error submitting pit scout:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
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
    convertMatchScoutToCSV,
    submitPitScoutForm
}