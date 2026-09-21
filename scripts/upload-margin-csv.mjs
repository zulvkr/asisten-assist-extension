import fs from "fs";
import path from "path";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, writeBatch, collection, getDocs } from "firebase/firestore";
import readline from "readline";

const firebaseConfig = {
  apiKey: "AIzaSyDV8Z7K62-bzrlRcaBMJZedCbarQcSExm8",
  authDomain: "asisten-assist.firebaseapp.com",
  projectId: "asisten-assist",
  storageBucket: "asisten-assist.firebasestorage.app",
  messagingSenderId: "1034065647274",
  appId: "1:1034065647274:web:eec1bd2fb8bf0b172322d3"
};

const DEFAULT_CSV_PATH = "C:\\Users\\ivanz\\Downloads\\Margin - Assist.csv";
const MARGIN_COLLECTION = "margin_mappings";

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseMarginCsvFile(filePath) {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    throw new Error("File CSV kosong atau tidak memiliki data.");
  }

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const kodeAssist = (row[0] || "").trim();
    if (!kodeAssist) continue;

    items.push({
      kodeAssist,
      nama: (row[1] || "").trim(),
      margin: (row[2] || "").trim(),
      batasWarningStok: (row[3] || "").trim(),
      matikanWarningStok: (row[4] || "").trim(),
      sku: (row[5] || "").trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  return items;
}

async function promptInput(promptText, isHidden = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => a.endsWith(".csv")) || DEFAULT_CSV_PATH;
  const emailArg = args.find((a) => a.includes("@")) || "atk1.apotekaldila@gmail.com";
  let passwordArg = process.env.FIREBASE_PASSWORD || "";

  if (!passwordArg) {
    const passArgIdx = args.findIndex((a) => a === "-p" || a === "--password");
    if (passArgIdx !== -1 && args[passArgIdx + 1]) {
      passwordArg = args[passArgIdx + 1];
    }
  }

  console.log("=== Upload Margin & SKU Mapping to Firebase Firestore ===");
  console.log(`CSV File: ${csvPath}`);
  console.log(`Target Collection: ${MARGIN_COLLECTION}`);

  if (!fs.existsSync(csvPath)) {
    throw new Error(`File tidak ditemukan di ${csvPath}`);
  }

  const items = parseMarginCsvFile(csvPath);
  console.log(`Ditemukan ${items.length} baris valid dari CSV.`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let email = emailArg;
  let password = passwordArg;

  if (!password) {
    console.log(`Login Firebase sebagai: ${email}`);
    password = await promptInput("Masukkan password Firebase: ");
  }

  console.log(`Mengautentikasi ke Firebase (${email})...`);
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  console.log(`Berhasil login sebagai ${userCredential.user.email} (UID: ${userCredential.user.uid})`);

  // Batch upload
  const BATCH_SIZE = 400;
  const total = items.length;
  console.log(`Memulai upload ${total} data ke Firestore...`);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const docRef = doc(db, MARGIN_COLLECTION, item.kodeAssist);
      batch.set(docRef, {
        ...item,
        updatedBy: userCredential.user.email || "CLI",
      }, { merge: true });
    }

    await batch.commit();
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, total)} / ${total} data berhasil diunggah.`);
  }

  console.log("=== Selesai! Semua data Margin & SKU Mapping berhasil diunggah ke Firestore. ===");
}

run().catch((err) => {
  console.error("Gagal mengunggah data:", err.message || err);
  process.exit(1);
});
