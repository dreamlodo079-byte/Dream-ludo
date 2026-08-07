fetch("http://127.0.0.1:5000/api/users/add-test-balance", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ secret: "DREAM_LUDO_TEST_KEY_999", winningsAmount: 1000, depositAmount: 0 })
}).then(res => res.json()).then(console.log).catch(console.error);
