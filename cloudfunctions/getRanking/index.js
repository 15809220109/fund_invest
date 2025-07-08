// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
// 功能：纯粹的排名数据查询，不含任何业务逻辑
exports.main = async (event, context) => {
  try {
    console.log('getRanking 云函数开始执行，参数:', event);
    
    // 简化参数处理，消除重复计算
    const limit = Math.max(1, Math.min(Number(event.limit) || 100, 100));
    
    // 纯粹的数据查询，按总资产降序排序
    const result = await db.collection('users')
      .orderBy('totalAmount', 'desc')
      .limit(limit)
      .get();
    
    console.log(`从数据库获取到 ${result.data.length} 条用户数据`);
    
    // 直接返回原始数据，不做任何处理
    return {
      success: true,
      data: result.data
    };
    
  } catch (error) {
    console.error('getRanking 云函数执行错误:', error);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
} 