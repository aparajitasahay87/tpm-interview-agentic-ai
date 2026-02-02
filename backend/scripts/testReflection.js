require('dotenv').config();
const ReflectionAgent = require('../agents/tools/ReflectionAgent');

async function testReflection() {
  console.log('🧪 Testing ReflectionAgent in isolation...\n');
  
  // Test Case 1: Generic improvements (should be enhanced)
  console.log('═══════════════════════════════════════');
  console.log('TEST 1: Generic Improvements');
  console.log('═══════════════════════════════════════');
  
  const genericImprovements = [
    "Add more details about your role",
    "Be more specific about the project",
    "Include metrics in your result"
  ];
  
  console.log('\n📝 BEFORE Reflection:');
  genericImprovements.forEach((imp, i) => console.log(`${i + 1}. ${imp}`));
  
  const refined = await ReflectionAgent.reflect(genericImprovements);
  
  console.log('\n✨ AFTER Reflection:');
  refined.forEach((imp, i) => console.log(`${i + 1}. ${imp}`));
  
  // Test Case 2: Already good improvements (should stay mostly same)
  console.log('\n\n═══════════════════════════════════════');
  console.log('TEST 2: Already Good Improvements');
  console.log('═══════════════════════════════════════');
  
  const goodImprovements = [
    "Add company and role: 'As TPM at Amazon, I...'",
    "Include team size: 'led 15 engineers across 3 organizations'",
    "Add metrics: 'reduced deployment time from 6 weeks to 2 weeks'"
  ];
  
  console.log('\n📝 BEFORE Reflection:');
  goodImprovements.forEach((imp, i) => console.log(`${i + 1}. ${imp}`));
  
  const refined2 = await ReflectionAgent.reflect(goodImprovements);
  
  console.log('\n✨ AFTER Reflection:');
  refined2.forEach((imp, i) => console.log(`${i + 1}. ${imp}`));
  
  console.log('\n\n═══════════════════════════════════════');
  console.log('✅ Reflection test complete!');
  console.log('═══════════════════════════════════════');
}

testReflection().catch(console.error);