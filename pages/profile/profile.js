Page({
  data: {
    nickname: '',
    avatar: '',
    uploading: false,
    saving: false,
    isEdit: false, // 是否为编辑模式
    fromRanking: false, // 是否从排名页面跳转而来
    fromLogin: false, // 是否从登录页面跳转而来
    maxNicknameLength: 12, // 昵称最大长度
    createTime: '', // 创建时间
    lastLoginTime: '', // 最后登录时间
    formatCreateTime: '', // 格式化后的创建时间
    formatLastLoginTime: '' // 格式化后的最后登录时间
  },

  onLoad: function (options) {
    // 资料设置页面加载
    
    // 检查跳转来源
    if (options.from === 'ranking') {
      this.setData({ fromRanking: true });
    } else if (options.from === 'login') {
      this.setData({ fromLogin: true });
    }
    
    // 加载现有用户资料
    this.loadUserProfile();
  },

  onShow: function() {
    // 页面显示时重新加载用户资料，确保显示最新的登录时间
    this.loadUserProfile();
  },

  /**
   * 加载用户资料
   */
  loadUserProfile: function() {
    const app = getApp();
    const userData = app.globalData.userData;
    
    if (userData) {
      // 从全局数据获取用户信息
      const profile = userData.profile || {};
      const createTime = userData.createTime || '';
      const lastLoginTime = userData.lastLoginTime || '';
      
      this.setData({
        nickname: profile.nickname || '',
        avatar: profile.avatar || '',
        isEdit: !!(profile.nickname || profile.avatar),
        createTime: createTime,
        lastLoginTime: lastLoginTime,
        formatCreateTime: this.formatDate(createTime),
        formatLastLoginTime: this.formatDate(lastLoginTime)
      });
    }
  },

  /**
   * 格式化日期显示
   */
  formatDate: function(dateString) {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = now - date;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
      const diffMinutes = Math.floor(diffTime / (1000 * 60));
      
      // 如果是今天
      if (diffDays === 0) {
        if (diffHours === 0) {
          if (diffMinutes === 0) {
            return '刚刚';
          } else {
            return `${diffMinutes}分钟前`;
          }
        } else {
          return `${diffHours}小时前`;
        }
      }
      // 如果是昨天
      else if (diffDays === 1) {
        return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      }
      // 如果是今年
      else if (date.getFullYear() === now.getFullYear()) {
        return `${date.getMonth() + 1}月${date.getDate()}日 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      }
      // 其他情况显示完整日期
      else {
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      }
    } catch (error) {
      console.error('日期格式化失败:', error);
      return dateString;
    }
  },

  /**
   * 选择头像
   */
  chooseAvatar: function() {
    if (this.data.uploading) return;
    
    const self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success: function(res) {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 70,
          success: function(compressRes) {
            self.uploadAvatar(compressRes.tempFilePath);
          },
          fail: function() {
            // 压缩失败，使用原图
            self.uploadAvatar(tempFilePath);
          }
        });
      },
      fail: function(err) {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 上传头像到云存储
   */
  uploadAvatar: function(tempFilePath) {
    const self = this;
    
    self.setData({ uploading: true });
    
    wx.showLoading({
      title: '上传头像中...',
      mask: true
    });

    // 记录旧头像URL，用于后续删除
    const oldAvatarUrl = self.data.avatar;

    // 生成唯一文件名
    const app = getApp();
    const openid = app.globalData.openid;
    const timestamp = Date.now();
    // 使用统一的头像路径格式
    const cloudPath = `avatars/${openid}_${timestamp}.jpg`;

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: function(res) {
        // 头像上传成功后，立即设置文件权限为所有人可读
        self.setFilePermission(res.fileID).then(() => {
          // 如果有旧头像，删除旧头像文件
          if (oldAvatarUrl && oldAvatarUrl.startsWith('cloud://')) {
            self.deleteOldAvatar(oldAvatarUrl);
          }
          
          // 更新页面数据
          self.setData({
            avatar: res.fileID,
            uploading: false
          });
          
          wx.hideLoading();
          wx.showToast({
            title: '头像上传成功',
            icon: 'success'
          });
        }).catch(err => {
          console.warn('设置文件权限失败，但上传成功:', err);
          
          // 即使权限设置失败，也删除旧头像
          if (oldAvatarUrl && oldAvatarUrl.startsWith('cloud://')) {
            self.deleteOldAvatar(oldAvatarUrl);
          }
          
          // 更新页面数据
          self.setData({
            avatar: res.fileID,
            uploading: false
          });
          
          wx.hideLoading();
          wx.showToast({
            title: '头像上传成功',
            icon: 'success'
          });
        });
      },
      fail: function(err) {
        console.error('头像上传失败:', err);
        self.setData({ uploading: false });
        wx.hideLoading();
        wx.showToast({
          title: '头像上传失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 删除旧头像文件
   */
  deleteOldAvatar: function(oldAvatarUrl) {
    wx.cloud.deleteFile({
      fileList: [oldAvatarUrl],
      success: function(res) {
        // 删除成功
      },
      fail: function(err) {
        console.warn('删除旧头像失败，但不影响新头像使用:', err);
        // 删除失败不影响新头像的使用，只是会留下旧文件
      }
    });
  },

  /**
   * 设置文件权限（尝试）
   */
  setFilePermission: function(fileID) {
    return new Promise((resolve, reject) => {
      // 注意：微信小程序暂不支持客户端直接设置文件权限
      // 这里仅作为预留接口，实际需要在云函数中处理
      // 或者通过云开发控制台设置存储权限为"所有人可读"
      
      resolve();
    });
  },

  /**
   * 昵称输入
   */
  onNicknameInput: function(e) {
    const value = e.detail.value;
    
    // 限制长度
    if (value.length > this.data.maxNicknameLength) {
      wx.showToast({
        title: `昵称不能超过${this.data.maxNicknameLength}个字符`,
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      nickname: value
    });
  },

  /**
   * 保存用户资料
   */
  saveProfile: function() {
    const { nickname, avatar } = this.data;
    
    // 验证输入
    if (!nickname.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      });
      return;
    }
    
    if (!avatar) {
      wx.showToast({
        title: '请选择头像',
        icon: 'none'
      });
      return;
    }
    
    // 过滤敏感词
    if (this.containsSensitiveWords(nickname.trim())) {
      wx.showToast({
        title: '昵称包含敏感词，请修改',
        icon: 'none'
      });
      return;
    }
    
    this.uploadUserProfile(nickname.trim(), avatar);
  },

  /**
   * 上传用户资料到云端
   */
  uploadUserProfile: async function(nickname, avatar) {
    const self = this;
    
    self.setData({ saving: true });
    
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'userDataManager',
        data: {
          action: 'updateProfile',
          data: {
            nickname: nickname,
            avatar: avatar
          }
        }
      });
      
      if (result.result.success) {
        // 更新全局数据
        const app = getApp();
        if (!app.globalData.userData) {
          app.globalData.userData = {};
        }
        app.globalData.userData.profile = {
          nickname: nickname,
          avatar: avatar
        };
        
        wx.hideLoading();
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        
        // 延迟返回上一页
        setTimeout(() => {
          if (self.data.fromRanking) {
            // 如果是从排名页面跳转来的，返回排名页面并刷新
            wx.navigateBack({
              success: function() {
                // 通知排名页面刷新数据
                const pages = getCurrentPages();
                const prevPage = pages[pages.length - 1];
                if (prevPage && prevPage.loadRankingData) {
                  prevPage.loadRankingData();
                }
              }
            });
          } else if (self.data.fromLogin) {
            // 如果是从登录页面跳转来的，返回登录页面并刷新用户信息
            wx.navigateBack({
              success: function() {
                // 通知登录页面刷新用户信息
                const pages = getCurrentPages();
                const prevPage = pages[pages.length - 1];
                if (prevPage && prevPage.loadLocalUserInfo) {
                  prevPage.loadLocalUserInfo();
                }
              }
            });
          } else {
            wx.navigateBack();
          }
        }, 1500);
        
      } else {
        throw new Error(result.result.error || '保存失败');
      }
      
    } catch (error) {
      console.error('保存用户资料失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '保存失败',
        content: error.message || '网络错误，请重试',
        showCancel: false
      });
    } finally {
      self.setData({ saving: false });
    }
  },

  /**
   * 简单的敏感词检测
   */
  containsSensitiveWords: function(text) {
    const sensitiveWords = [
      '管理员', 'admin', '客服', '官方', '系统',
      '色情', '赌博', '政治', '广告'
    ];
    
    const lowerText = text.toLowerCase();
    return sensitiveWords.some(word => lowerText.includes(word));
  },

  /**
   * 预览头像
   */
  previewAvatar: function() {
    if (!this.data.avatar) return;
    
    wx.previewImage({
      urls: [this.data.avatar],
      current: this.data.avatar
    });
  },

  /**
   * 返回上一页
   */
  goBack: function() {
    wx.navigateBack();
  },

  /**
   * 分享配置
   */
  onShareAppMessage: function() {
    return {
              title: '养基高手 - 设置我的资料',
      path: '/pages/fund/fund'
    };
  }
}); 