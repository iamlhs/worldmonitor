import os, shutil
src = r"d:\华东师大计科\6月事件文件\edas\EDAS\static\exports"
dst = r"d:\华东师大计科\6月事件文件\worldmonitor-main\worldmonitor-main\public\edas_exports"
print('源：', src)
print('目标：', dst)
os.makedirs(dst, exist_ok=True)
count=0
for name in os.listdir(src):
    s = os.path.join(src, name)
    d = os.path.join(dst, name)
    try:
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
        count+=1
    except Exception as e:
        print('复制失败', s, '->', d, e)
print('复制完成，总文件/目录数：', count)
