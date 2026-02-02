require('dotenv').config();

async function compareReflection() {
  console.log('🧪 Testing Reflection Impact...\n');
  
  const testAnswer = "I worked on a project with my team. We had some challenges but managed to complete it successfully and everyone was happy with the outcome.";
  
  console.log('═══════════════════════════════════════');
  console.log('TEST INPUT:');
  console.log('═══════════════════════════════════════');
  console.log(testAnswer);
  console.log('\n');
  
  // Test 1: Admin (with reflection)
  console.log('═══════════════════════════════════════');
  console.log('TEST 1: WITH REFLECTION (Admin)');
  console.log('═══════════════════════════════════════');
  
  const adminResponse = await fetch('http://localhost:3000/api/tools/parse-star', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answer: testAnswer,
      userId: 'admin-123',
      userEmail: 'aparajita.sahay87@gmail.com'
    })
  });
  
  const adminData = await adminResponse.json();
  
  console.log(`\n✅ Reflection Used: ${adminData.metadata.reflection_used}`);
  console.log(`⏱️  Response Time: ${adminData.metadata.execution_time_ms}ms`);
  console.log(`\n📊 Improvements (${adminData.analysis.improvement_analysis.improvements.length}):`);
  adminData.analysis.improvement_analysis.improvements.forEach((imp, i) => {
    console.log(`${i + 1}. ${imp}`);
  });
  
  // Test 2: Regular user (without reflection)
  console.log('\n\n═══════════════════════════════════════');
  console.log('TEST 2: WITHOUT REFLECTION (Regular User)');
  console.log('═══════════════════════════════════════');
  
  const userResponse = await fetch('http://localhost:3000/api/tools/parse-star', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answer: testAnswer,
      userId: 'user-456',
      userEmail: 'test@example.com'
    })
  });
  
  const userData = await userResponse.json();
  
  console.log(`\n✅ Reflection Used: ${userData.metadata.reflection_used}`);
  console.log(`⏱️  Response Time: ${userData.metadata.execution_time_ms}ms`);
  console.log(`\n📊 Improvements (${userData.analysis.improvement_analysis.improvements.length}):`);
  userData.analysis.improvement_analysis.improvements.forEach((imp, i) => {
    console.log(`${i + 1}. ${imp}`);
  });
  
  // Analysis
  console.log('\n\n═══════════════════════════════════════');
  console.log('📈 COMPARISON ANALYSIS');
  console.log('═══════════════════════════════════════');
  
  const adminImprovements = adminData.analysis.improvement_analysis.improvements;
  const userImprovements = userData.analysis.improvement_analysis.improvements;
  
  // Count specificity
  const adminSpecific = adminImprovements.filter(imp => /\d+|["']/.test(imp)).length;
  const userSpecific = userImprovements.filter(imp => /\d+|["']/.test(imp)).length;
  
  const adminSpecificPercent = ((adminSpecific / adminImprovements.length) * 100).toFixed(1);
  const userSpecificPercent = ((userSpecific / userImprovements.length) * 100).toFixed(1);
  
  console.log(`\nSpecificity (has numbers/quotes):`);
  console.log(`  With Reflection:    ${adminSpecific}/${adminImprovements.length} (${adminSpecificPercent}%)`);
  console.log(`  Without Reflection: ${userSpecific}/${userImprovements.length} (${userSpecificPercent}%)`);
  console.log(`  Improvement: +${(adminSpecificPercent - userSpecificPercent).toFixed(1)}%`);
  
  // Average length
  const adminAvgLength = (adminImprovements.reduce((sum, imp) => sum + imp.length, 0) / adminImprovements.length).toFixed(0);
  const userAvgLength = (userImprovements.reduce((sum, imp) => sum + imp.length, 0) / userImprovements.length).toFixed(0);
  
  console.log(`\nAverage Improvement Length:`);
  console.log(`  With Reflection:    ${adminAvgLength} characters`);
  console.log(`  Without Reflection: ${userAvgLength} characters`);
  console.log(`  Difference: +${adminAvgLength - userAvgLength} characters`);
  
  // Time impact
  const timeDiff = adminData.metadata.execution_time_ms - userData.metadata.execution_time_ms;
  console.log(`\nResponse Time Impact:`);
  console.log(`  Additional time: +${timeDiff}ms (${((timeDiff / userData.metadata.execution_time_ms) * 100).toFixed(1)}% slower)`);
  
  console.log('\n✅ Comparison complete!');
}

compareReflection().catch(console.error);