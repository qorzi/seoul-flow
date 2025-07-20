import os
import requests
import zipfile
from tqdm import tqdm
import shutil
import glob

def download_and_extract_geolife(target_dir="data"):
    """
    GeoLife 데이터셋을 다운로드하고, 압축 해제 후 'labels.txt'가 없는 사용자 디렉터리를 삭제합니다.
    """
    # 1. 대상 디렉토리 생성 (없을 경우)
    os.makedirs(target_dir, exist_ok=True)
    
    # 성공 마커 파일 경로 정의
    success_marker_path = os.path.join(target_dir, ".download_success")

    # 2. 마커 파일이 존재하면 다운로드를 건너뜀
    if os.path.exists(success_marker_path):
        print("성공 마커 파일이 존재합니다. 데이터 다운로드를 건너뜁니다.")
        return

    url = "https://download.microsoft.com/download/F/4/8/F4894AA5-FDBC-481E-9285-D5F8C4C4F039/Geolife%20Trajectories%201.3.zip"
    zip_path = os.path.join(target_dir, "geolife.zip")

    print(f"{url} 에서 GeoLife 데이터셋 다운로드를 시작합니다...")
    try:
        # 3. 프로그레스 바와 함께 파일 다운로드 (디스크에 저장)
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            total_size_in_bytes = int(r.headers.get('content-length', 0))
            block_size = 1024  # 1 Kibibyte
            
            progress_bar = tqdm(total=total_size_in_bytes, unit='iB', unit_scale=True, desc="다운로드 중")
            with open(zip_path, 'wb') as f:
                for data in r.iter_content(block_size):
                    progress_bar.update(len(data))
                    f.write(data)
            progress_bar.close()

            if total_size_in_bytes != 0 and progress_bar.n != total_size_in_bytes:
                print("오류: 다운로드가 비정상적으로 종료되었습니다.")
                return # 실패 시 중단

        # 4. 압축 해제
        print(f"\n{zip_path} 압축 해제 중...")
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(target_dir)
        print("압축 해제 완료.")

        # 5. 데이터 구조 정리: 불필요한 폴더 계층 제거
        source_folder = os.path.join(target_dir, "Geolife Trajectories 1.3")
        data_subfolder = os.path.join(source_folder, "Data")
        dest_data_folder = os.path.join(target_dir, "Data")

        # 'Data' 폴더 이동
        if os.path.exists(data_subfolder):
            shutil.move(data_subfolder, dest_data_folder)
            print(f"폴더 이동: '{data_subfolder}' -> '{dest_data_folder}'")

        # --- 수정된 부분 시작 ---
        print("\n레이블이 없는 사용자 데이터 정리 중...")
        user_dirs = glob.glob(os.path.join(dest_data_folder, "*"))
        deleted_count = 0
        kept_count = 0
        
        for user_dir in user_dirs:
            if os.path.isdir(user_dir):
                labels_file_path = os.path.join(user_dir, "labels.txt")
                if not os.path.exists(labels_file_path):
                    shutil.rmtree(user_dir)
                    # print(f"삭제됨: {user_dir} (labels.txt 없음)")
                    deleted_count += 1
                else:
                    kept_count += 1
        
        print(f"정리 완료: {kept_count}개 사용자 데이터 유지, {deleted_count}개 사용자 데이터 삭제.")
        # --- 수정된 부분 끝 ---

        # 빈 'Geolife Trajectories 1.3' 폴더 삭제
        if os.path.exists(source_folder):
            shutil.rmtree(source_folder)
            print(f"불필요한 폴더 삭제: {source_folder}")

        # 6. 모든 과정이 성공하면, 성공 마커 파일을 생성
        with open(success_marker_path, 'w') as f:
            pass
        print(f"성공 마커 파일 생성: {success_marker_path}")

    except Exception as e:
        print(f"\n오류가 발생했습니다: {e}")
    finally:
        # 7. 다운로드한 zip 파일 및 불필요한 가이드 파일 삭제
        if os.path.exists(zip_path):
            os.remove(zip_path)
            print(f"임시 파일 삭제: {zip_path}")
        
        # 최상위 경로의 불필요한 파일들 삭제
        for f in ["User Guide.pdf", "labels.txt"]:
            file_path = os.path.join(target_dir, f)
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"불필요한 파일 삭제: {file_path}")


if __name__ == "__main__":
    # 이 스크립트를 직접 실행할 때의 로직
    script_path = os.path.abspath(__file__)
    project_root = os.path.dirname(os.path.dirname(script_path))
    data_directory = os.path.join(project_root, "data")
    
    print(f"데이터 다운로드 경로: {data_directory}")
    download_and_extract_geolife(target_dir=data_directory)