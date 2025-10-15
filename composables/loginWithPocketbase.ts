import PocketBase from "pocketbase";

export async function loginWithPocketbase() {
  const pb = new PocketBase("http://127.0.0.1:8090");

  const authData = await pb
    .collection("_superusers")
    .authWithPassword("apotek.aldila@gmail.com", "An6Htvqxuf4Y$Mf");

  console.log("Logged in to PocketBase:", authData);

  return pb;
}
